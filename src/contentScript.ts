import { buildProfileData, getFieldKey, getFieldName, getFieldValue, type ProfileData } from './utils';

console.log("QA Form Autofill Content Script Loaded!");

type DropdownStrategy = 'first' | 'second' | 'random';
type FormType = 'application' | 'event' | 'signup' | 'general';
type LearnedAnswers = Record<string, string>;
type LearnedByForm = Record<FormType, LearnedAnswers>;
type AutofillSettings = {
    profileType: string;
    formType: string;
    dropdownStrategy: string;
    autoSubmit: boolean;
    dryRun: boolean;
    debugMode: boolean;
    toggleDenylist: string;
    fieldOverrides: Record<string, string>;
};
type FillSource = 'learned' | 'mapped' | 'fallback';
type LearnedContextRecord = {
    formType: FormType;
    urlPattern: string;
    stepKey: string;
    sectionKey: string;
    fieldCandidates: string[];
    value: string;
    updatedAt: number;
};
type FormRecipe = {
    id: string;
    formType: FormType;
    urlPatterns: string[];
    fieldOverrides: Record<string, string>;
};
type NameSet = {
    firstName: string;
    lastName: string;
    updatedAt: number;
};
type AutofillReport = {
    startedAt: string;
    formType: FormType;
    dryRun: boolean;
    stepsTraversed: number;
    filled: number;
    retried: number;
    invalidAfterRetry: number;
    details: string[];
};

const LEARNED_STORAGE_KEY_BY_FORM = 'learnedFieldAnswersByForm';
const LEARNED_CONTEXT_STORAGE_KEY = 'learnedFieldAnswersV2';
const LAST_REPORT_STORAGE_KEY = 'lastAutofillReport';
const RECENT_NAME_SETS_STORAGE_KEY = 'recentNameSets';
const AUTO_POPUP_HOSTS_KEY = 'autoPopupHosts';
const AUTO_POPUP_ID = 'qa-autofill-inline-popup';
const DEFAULT_AUTO_POPUP_HOSTS = [
    'app.enquirytracker.net',
    'app-us.enquirytracker.net',
    'dev.enquirytracker.net',
    'staging.enquirytracker.net'
];
const DEFAULT_TOGGLE_DENYLIST = 'none,no,not applicable,prefer not,decline';
const ADDRESS_LOOKUP_QUERY = '123 Eagle Street';
const KG_COUNTRY_ISO = 'kg';
const KG_DIAL = '+996';
const KG_LOCAL_PHONE = '777777777';

let learningListenersAttached = false;
let currentFormType: FormType = 'general';
let currentSettings: AutofillSettings | null = null;
let currentReport: AutofillReport | null = null;
let currentAddressAutocompleteUsed = false;
let currentNameSlots: NameSet[] = [];
const sectionNameDraft: Record<string, Partial<NameSet>> = {};

const SMART_OPTION_RULES: Record<string, string[]> = {
    relationship: ['parent', 'mother', 'father', 'guardian'],
    communicationpreference: ['email', 'mobile', 'phone'],
    salutation: ['mr', 'mrs', 'ms'],
    gender: ['male', 'female'],
    familyconnection: ['parent', 'mother', 'father'],
    language: ['english'],
    geographicstatus: ['local', 'domestic']
};

const FORM_RECIPES: FormRecipe[] = [
    {
        id: 'general',
        formType: 'general',
        urlPatterns: ['/webforms/general/'],
        fieldOverrides: {
            salutationId: 'Mr',
            genderId: 'Male',
            relationshipId: 'Mother',
            mainLanguageId: 'English',
            hearAboutUsId: 'Advertising'
        }
    },
    {
        id: 'prospectus',
        formType: 'general',
        urlPatterns: ['/webforms/prospectus-request/'],
        fieldOverrides: {
            salutationId: 'Mr',
            genderId: 'Male',
            relationshipId: 'Mother',
            mainLanguageId: 'English'
        }
    },
    {
        id: 'event',
        formType: 'event',
        urlPatterns: ['/webforms/event-registration/'],
        fieldOverrides: {
            salutationId: 'Mr',
            genderId: 'Male',
            relationshipId: 'Mother',
            mainLanguageId: 'English',
            totalAttendees: '2'
        }
    },
    {
        id: 'application',
        formType: 'application',
        urlPatterns: ['/application/', '/request-application/'],
        fieldOverrides: {
            mainLanguageId: 'English',
            studentResidenceId: 'Both Parents'
        }
    }
];

const FALLBACK_NAME_SETS: Array<{ firstName: string; lastName: string }> = [
    { firstName: 'John', lastName: 'Doe' },
    { firstName: 'Jane', lastName: 'Smith' },
    { firstName: 'Alex', lastName: 'Brown' },
    { firstName: 'Emily', lastName: 'Wilson' },
    { firstName: 'Michael', lastName: 'Taylor' }
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "FILL_FORM") {
        fillForms(
            message.profileType || 'random',
            message.formType || 'general',
            message.dropdownStrategy || 'first',
            {
                autoSubmit: Boolean(message.autoSubmit),
                dryRun: Boolean(message.dryRun),
                debugMode: Boolean(message.debugMode),
                toggleDenylist: typeof message.toggleDenylist === 'string' ? message.toggleDenylist : DEFAULT_TOGGLE_DENYLIST,
                fieldOverrides: (message.fieldOverrides && typeof message.fieldOverrides === 'object')
                    ? message.fieldOverrides as Record<string, string>
                    : {}
            }
        )
            .then((result) => sendResponse({ status: "success", ...result }))
            .catch((error: unknown) => {
                console.error('Autofill failed:', error);
                sendResponse({ status: "error" });
            });
        return true;
    }
});

function normalizeDropdownStrategy(strategy: string): DropdownStrategy {
    if (strategy === 'second') return 'second';
    if (strategy === 'random') return 'random';
    return 'first';
}

function normalizeKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isEmptyValue(value: string): boolean {
    return value.trim() === '';
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStorage<T>(keys: string[]): Promise<T> {
    return new Promise((resolve) => chrome.storage.local.get(keys, (result) => resolve(result as T)));
}

function setStorage(value: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => chrome.storage.local.set(value, () => resolve()));
}

function appendReportDetail(message: string): void {
    if (!currentReport) return;
    if (currentReport.details.length < 120) {
        currentReport.details.push(message);
    }
}

function detectFormType(explicitFormType: string): FormType {
    const path = window.location.pathname.toLowerCase();
    const titleText = document.body?.innerText?.slice(0, 5000).toLowerCase() || '';
    const explicit = explicitFormType.toLowerCase();

    if (path.includes('event-registration') || path.includes('/event/')) return 'event';
    if (path.includes('prospectus-request') || path.includes('/general/')) return 'general';
    if (path.includes('application') || path.includes('enrol') || path.includes('enroll')) return 'application';
    if (path.includes('signup') || path.includes('sign-up')) return 'signup';

    if (titleText.includes('event registration')) return 'event';
    if (titleText.includes('prospectus') || titleText.includes('general enquiry')) return 'general';
    if (titleText.includes('application') || titleText.includes('enrolment') || titleText.includes('enrollment')) return 'application';
    if (titleText.includes('sign up') || titleText.includes('signup')) return 'signup';

    if (explicit === 'application' || explicit === 'event' || explicit === 'signup' || explicit === 'general') {
        return explicit;
    }
    return 'general';
}

function getCurrentUrlPattern(): string {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/request-application/')) return '/request-application/';
    if (path.includes('/application/')) return '/application/';
    if (path.includes('/webforms/general/')) return '/webforms/general/';
    if (path.includes('/webforms/prospectus-request/')) return '/webforms/prospectus-request/';
    if (path.includes('/webforms/event-registration/')) return '/webforms/event-registration/';
    if (path.includes('/webforms/')) return '/webforms/';
    return '/';
}

function getRecipeByUrl(pathname: string): FormRecipe | null {
    const normalizedPath = pathname.toLowerCase();
    return FORM_RECIPES.find((recipe) =>
        recipe.urlPatterns.some((pattern) => normalizedPath.includes(pattern))
    ) || null;
}

function getStepKeyForElement(element: Element): string {
    const selectedHeader = document.querySelector<HTMLElement>(
        '.mat-step-header[aria-selected="true"], .mat-mdc-step-header[aria-selected="true"], [role="tab"][aria-selected="true"]'
    );
    const headerText = selectedHeader ? textForElement(selectedHeader) : '';
    if (headerText) {
        return normalizeKey(headerText).slice(0, 60);
    }

    const localStep = element.closest('[id*="step"], .mat-step-content, .mat-horizontal-stepper-content');
    if (localStep instanceof HTMLElement && localStep.id) {
        return normalizeKey(localStep.id);
    }

    return 'default-step';
}

function getSectionKeyForElement(element: Element): string {
    const section = element.closest('section, mat-card, .section, .form-group, .mat-card-content, .step, .row');
    if (!section) return 'global';

    const heading = section.querySelector('h1, h2, h3, h4, legend, mat-card-title, .section-title, .title');
    const headingText = heading ? textForElement(heading) : '';
    if (headingText) return normalizeKey(headingText).slice(0, 80);

    const sectionText = textForElement(section).slice(0, 80);
    return sectionText ? normalizeKey(sectionText).slice(0, 80) : 'global';
}

function getFieldCandidates(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, fieldName: string): string[] {
    const rawCandidates = [
        element.getAttribute('formcontrolname') || '',
        element.getAttribute('name') || '',
        element.id || '',
        element.getAttribute('aria-label') || '',
        element.getAttribute('placeholder') || '',
        fieldName
    ];

    if (element instanceof HTMLElement) {
        const label = element.closest('label')?.textContent || '';
        rawCandidates.push(label);
        const wrapperLabel = element.closest('mat-form-field, .form-group, .field')?.querySelector('label, mat-label')?.textContent || '';
        rawCandidates.push(wrapperLabel);
    }

    const normalized = rawCandidates
        .map((candidate) => normalizeKey(candidate))
        .filter(Boolean);

    const keyFromFieldName = getFieldKey(fieldName);
    if (keyFromFieldName) {
        normalized.push(normalizeKey(keyFromFieldName));
    }

    return [...new Set(normalized)].slice(0, 12);
}

function getEmptyLearnedByForm(): LearnedByForm {
    return {
        application: {},
        event: {},
        signup: {},
        general: {}
    };
}

async function getLearnedByForm(): Promise<LearnedByForm> {
    const result = await getStorage<Record<string, unknown>>([LEARNED_STORAGE_KEY_BY_FORM]);
    const scoped = result[LEARNED_STORAGE_KEY_BY_FORM];
    if (scoped && typeof scoped === 'object') {
        const value = scoped as Partial<LearnedByForm>;
        return {
            ...getEmptyLearnedByForm(),
            ...value
        };
    }
    return getEmptyLearnedByForm();
}

async function getLearnedContextRecords(): Promise<LearnedContextRecord[]> {
    const result = await getStorage<Record<string, unknown>>([LEARNED_CONTEXT_STORAGE_KEY]);
    const value = result[LEARNED_CONTEXT_STORAGE_KEY];
    if (!Array.isArray(value)) return [];
    return value as LearnedContextRecord[];
}

function normalizeNamePart(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

function isValidNameSet(firstName: string, lastName: string): boolean {
    return normalizeNamePart(firstName).length >= 2 && normalizeNamePart(lastName).length >= 2;
}

function uniqueNameSets(sets: NameSet[]): NameSet[] {
    const seen = new Set<string>();
    const output: NameSet[] = [];

    sets.forEach((set) => {
        const key = `${normalizeNamePart(set.firstName).toLowerCase()}|${normalizeNamePart(set.lastName).toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        output.push({
            firstName: normalizeNamePart(set.firstName),
            lastName: normalizeNamePart(set.lastName),
            updatedAt: set.updatedAt
        });
    });

    return output;
}

async function getRecentNameSets(): Promise<NameSet[]> {
    const result = await getStorage<Record<string, unknown>>([RECENT_NAME_SETS_STORAGE_KEY]);
    const value = result[RECENT_NAME_SETS_STORAGE_KEY];
    if (!Array.isArray(value)) return [];
    return (value as NameSet[])
        .filter((item) => typeof item?.firstName === 'string' && typeof item?.lastName === 'string')
        .map((item) => ({
            firstName: normalizeNamePart(item.firstName),
            lastName: normalizeNamePart(item.lastName),
            updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now()
        }));
}

async function saveRecentNameSets(sets: NameSet[]): Promise<void> {
    const unique = uniqueNameSets(sets)
        .filter((set) => isValidNameSet(set.firstName, set.lastName))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5);
    await setStorage({ [RECENT_NAME_SETS_STORAGE_KEY]: unique });
}

async function pushRecentNameSet(firstName: string, lastName: string): Promise<void> {
    if (!isValidNameSet(firstName, lastName)) return;
    const current = await getRecentNameSets();
    const incoming: NameSet = {
        firstName: normalizeNamePart(firstName),
        lastName: normalizeNamePart(lastName),
        updatedAt: Date.now()
    };
    await saveRecentNameSets([incoming, ...current]);
}

function buildNameSlots(sets: NameSet[]): NameSet[] {
    const unique = uniqueNameSets(sets)
        .filter((set) => isValidNameSet(set.firstName, set.lastName))
        .slice(0, 5);

    const merged = [...unique];
    FALLBACK_NAME_SETS.forEach((fallback, index) => {
        if (merged.length >= 5) return;
        merged.push({
            ...fallback,
            updatedAt: Date.now() - (index + 1) * 1000
        });
    });
    return merged.slice(0, 5);
}

function getEntityNameSlotIndex(fieldName: string): number {
    const normalized = normalizeKey(fieldName);
    if (
        normalized.includes('contact2') ||
        normalized.includes('secondarycontact') ||
        normalized.includes('spouse') ||
        normalized.includes('guardian2') ||
        normalized.includes('secondparent')
    ) {
        return 1;
    }

    if (
        normalized.includes('student') ||
        normalized.includes('pupil') ||
        normalized.includes('child')
    ) {
        return 2;
    }

    return 0;
}

async function saveLearnedContextRecord(record: LearnedContextRecord): Promise<void> {
    const existing = await getLearnedContextRecords();
    const key = `${record.formType}|${record.urlPattern}|${record.stepKey}|${record.sectionKey}|${record.fieldCandidates[0] || ''}`;
    const deduped = existing.filter((item) => {
        const itemKey = `${item.formType}|${item.urlPattern}|${item.stepKey}|${item.sectionKey}|${item.fieldCandidates[0] || ''}`;
        return itemKey !== key;
    });

    deduped.unshift(record);
    const trimmed = deduped.slice(0, 2000);
    await setStorage({ [LEARNED_CONTEXT_STORAGE_KEY]: trimmed });
}

function scoreContextRecord(
    record: LearnedContextRecord,
    formType: FormType,
    urlPattern: string,
    stepKey: string,
    sectionKey: string,
    candidates: string[]
): number {
    let score = 0;
    if (record.formType === formType) score += 6;
    if (record.urlPattern === urlPattern) score += 5;
    if (record.stepKey === stepKey) score += 4;
    if (record.sectionKey === sectionKey) score += 3;

    const overlap = record.fieldCandidates.filter((candidate) => candidates.includes(candidate)).length;
    score += overlap * 5;

    const freshnessBoost = Math.max(0, 2 - Math.floor((Date.now() - record.updatedAt) / (1000 * 60 * 60 * 24)));
    score += freshnessBoost;
    return score;
}

function findLearnedContextValue(
    records: LearnedContextRecord[],
    formType: FormType,
    urlPattern: string,
    stepKey: string,
    sectionKey: string,
    candidates: string[]
): string | null {
    if (records.length === 0 || candidates.length === 0) return null;

    let bestScore = -1;
    let bestValue: string | null = null;
    records.forEach((record) => {
        const score = scoreContextRecord(record, formType, urlPattern, stepKey, sectionKey, candidates);
        if (score > bestScore && score >= 8) {
            bestScore = score;
            bestValue = record.value;
        }
    });

    return bestValue;
}

async function saveLearnedAnswer(formType: FormType, fieldKey: string, value: string): Promise<void> {
    const byForm = await getLearnedByForm();
    byForm[formType] = {
        ...byForm[formType],
        [fieldKey]: value
    };
    await setStorage({ [LEARNED_STORAGE_KEY_BY_FORM]: byForm });
}

async function getAutoPopupHosts(): Promise<string[]> {
    const result = await getStorage<Record<string, unknown>>([AUTO_POPUP_HOSTS_KEY]);
    const hosts = result[AUTO_POPUP_HOSTS_KEY];
    if (Array.isArray(hosts) && hosts.length > 0) {
        return hosts.map((item) => String(item));
    }
    await setStorage({ [AUTO_POPUP_HOSTS_KEY]: DEFAULT_AUTO_POPUP_HOSTS });
    return DEFAULT_AUTO_POPUP_HOSTS;
}

async function getAutofillSettings(): Promise<AutofillSettings> {
    const result = await getStorage<Record<string, unknown>>([
        'selectedProfile',
        'selectedFormType',
        'selectedDropdownStrategy',
        'selectedAutoSubmit',
        'selectedDryRun',
        'selectedDebugMode',
        'selectedToggleDenylist',
        'selectedFieldOverrides'
    ]);
    return {
        profileType: (result.selectedProfile as string) || 'random',
        formType: (result.selectedFormType as string) || 'general',
        dropdownStrategy: (result.selectedDropdownStrategy as string) || 'first',
        autoSubmit: Boolean(result.selectedAutoSubmit),
        dryRun: Boolean(result.selectedDryRun),
        debugMode: Boolean(result.selectedDebugMode),
        toggleDenylist: (result.selectedToggleDenylist as string) || DEFAULT_TOGGLE_DENYLIST,
        fieldOverrides: (result.selectedFieldOverrides as Record<string, string>) || {}
    };
}

async function runAutofillFromStoredSettings(): Promise<{ filledCount: number; report: AutofillReport }> {
    const settings = await getAutofillSettings();
    return fillForms(settings.profileType, settings.formType, settings.dropdownStrategy, settings);
}

function parseDenylist(raw: string): string[] {
    return raw
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

function textForElement(element: Element): string {
    return (element.textContent || '').replace(/\s+/g, ' ').trim();
}

function isElementVisible(element: Element): boolean {
    if (!(element instanceof HTMLElement)) return true;
    const style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
}

function removeAutoPopup(): void {
    document.getElementById(AUTO_POPUP_ID)?.remove();
}

function isTrackedEnquiryTrackerPage(hosts: string[]): boolean {
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    const isTrackedHost = hosts.some((entry) => host === entry || host.endsWith(`.${entry}`));
    const isTrackedPath = path.includes('/webforms/') || path.includes('/application/') || path.includes('/request-application/');
    return isTrackedHost && isTrackedPath;
}

function createAutoPopupElement(): HTMLElement {
    const popup = document.createElement('div');
    popup.id = AUTO_POPUP_ID;
    popup.style.cssText = [
        'position:fixed',
        'top:16px',
        'right:16px',
        'z-index:2147483647',
        'background:#ffffff',
        'border:1px solid #dbe2ea',
        'box-shadow:0 8px 24px rgba(25,42,70,0.16)',
        'border-radius:10px',
        'padding:10px 12px',
        'width:300px',
        'font-family:Arial,sans-serif',
        'color:#14213d'
    ].join(';');
    popup.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:13px;">QA Autofill</strong>
        <button id="qa-autofill-close" style="border:none;background:transparent;cursor:pointer;font-size:16px;line-height:1;">x</button>
      </div>
      <div style="font-size:12px;line-height:1.4;margin-bottom:10px;">
        EnquiryTracker form detected. Run smart autofill?
      </div>
      <div style="display:flex;gap:8px;">
        <button id="qa-autofill-run" style="flex:1;border:none;background:#2563eb;color:#fff;padding:8px;border-radius:6px;cursor:pointer;">Autofill</button>
        <button id="qa-autofill-hide" style="flex:1;border:1px solid #cbd5e1;background:#fff;color:#334155;padding:8px;border-radius:6px;cursor:pointer;">Hide</button>
      </div>
    `;
    return popup;
}

async function maybeShowAutoPopup(): Promise<void> {
    if (!document.body) return;
    const hosts = await getAutoPopupHosts();
    if (!isTrackedEnquiryTrackerPage(hosts)) {
        removeAutoPopup();
        return;
    }
    if (document.getElementById(AUTO_POPUP_ID)) return;

    const popup = createAutoPopupElement();
    document.body.appendChild(popup);

    const closeBtn = popup.querySelector<HTMLButtonElement>('#qa-autofill-close');
    const hideBtn = popup.querySelector<HTMLButtonElement>('#qa-autofill-hide');
    const runBtn = popup.querySelector<HTMLButtonElement>('#qa-autofill-run');

    const closePopup = () => removeAutoPopup();
    closeBtn?.addEventListener('click', closePopup);
    hideBtn?.addEventListener('click', closePopup);
    runBtn?.addEventListener('click', async () => {
        if (!runBtn) return;
        runBtn.disabled = true;
        runBtn.textContent = 'Filling...';
        try {
            const { filledCount } = await runAutofillFromStoredSettings();
            runBtn.textContent = `Done (${filledCount})`;
            setTimeout(closePopup, 800);
        } catch (error) {
            console.error('Autofill from inline popup failed:', error);
            runBtn.textContent = 'Try again';
            runBtn.disabled = false;
        }
    });
}

function getLearningKeys(fieldKey: string): string[] {
    const phoneKeys = ['phone', 'mobile', 'homePhone', 'workPhone'];
    if (phoneKeys.includes(fieldKey)) return phoneKeys;
    return [fieldKey];
}

function getElementCurrentValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
    if (element instanceof HTMLInputElement) {
        if (element.type === 'checkbox' || element.type === 'radio') {
            if (!element.checked) return '';
            return element.value || '1';
        }
        return element.value.trim();
    }
    if (element instanceof HTMLSelectElement) return element.value.trim();
    return element.value.trim();
}

function attachLearningListeners(): void {
    if (learningListenersAttached) return;
    learningListenersAttached = true;

    const saveHandler = async (event: Event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
        if (target.disabled || (target instanceof HTMLInputElement && target.readOnly)) return;

        const fieldName = getFieldName(target);
        const fieldKey = getFieldKey(fieldName) || normalizeKey(fieldName);
        if (!fieldKey) return;
        const candidates = getFieldCandidates(target, fieldName);

        const value = getElementCurrentValue(target);
        if (!value) return;

        const keys = getLearningKeys(fieldKey);
        await Promise.all(keys.map((key) => saveLearnedAnswer(currentFormType, key, value)));

        if (fieldKey === 'firstName' || fieldKey === 'lastName') {
            const sectionKey = getSectionKeyForElement(target);
            const draft = sectionNameDraft[sectionKey] || {};
            if (fieldKey === 'firstName') {
                draft.firstName = value;
            } else {
                draft.lastName = value;
            }
            sectionNameDraft[sectionKey] = draft;

            if (draft.firstName && draft.lastName) {
                await pushRecentNameSet(draft.firstName, draft.lastName);
            }
        }

        const contextRecord: LearnedContextRecord = {
            formType: currentFormType,
            urlPattern: getCurrentUrlPattern(),
            stepKey: getStepKeyForElement(target),
            sectionKey: getSectionKeyForElement(target),
            fieldCandidates: candidates,
            value,
            updatedAt: Date.now()
        };
        await saveLearnedContextRecord(contextRecord);
    };

    document.addEventListener('change', saveHandler, true);
    document.addEventListener('blur', saveHandler, true);
}

function isLanguageField(fieldName: string): boolean {
    const normalized = fieldName.toLowerCase();
    return normalized.includes('language') || normalized.includes('mainlanguage');
}

function isPlaceholderLike(text: string): boolean {
    const normalized = text.toLowerCase().trim();
    if (!normalized) return true;
    return normalized.startsWith('select') ||
        normalized.startsWith('choose') ||
        normalized.startsWith('please') ||
        normalized.startsWith('none') ||
        normalized === '-';
}

function findEnglishOption<T extends Element>(options: T[], textGetter: (option: T) => string): T | null {
    return options.find((option) => {
        const text = textGetter(option).toLowerCase();
        return text.includes('english') || text === 'eng' || text.startsWith('eng ');
    }) || null;
}

function getRulePhrases(fieldName: string): string[] {
    const normalized = normalizeKey(fieldName);
    const matches: string[] = [];
    Object.entries(SMART_OPTION_RULES).forEach(([key, values]) => {
        if (normalized.includes(key)) {
            matches.push(...values);
        }
    });
    return [...new Set(matches)];
}

function findRankedOption<T extends Element>(
    options: T[],
    fieldName: string,
    textGetter: (option: T) => string
): T | null {
    const phrases = getRulePhrases(fieldName);
    if (phrases.length === 0) return null;
    return options.find((option) => {
        const text = textGetter(option).toLowerCase();
        return phrases.some((phrase) => text.includes(phrase));
    }) || null;
}

function findPreferredOption<T extends Element>(
    options: T[],
    preferredValue: string,
    textGetter: (option: T) => string,
    valueGetter?: (option: T) => string
): T | null {
    const preferred = preferredValue.toLowerCase().trim();
    if (!preferred) return null;

    const exact = options.find((option) => {
        const text = textGetter(option).toLowerCase().trim();
        const value = valueGetter ? valueGetter(option).toLowerCase().trim() : '';
        return text === preferred || value === preferred;
    });
    if (exact) return exact;

    return options.find((option) => {
        const text = textGetter(option).toLowerCase();
        const value = valueGetter ? valueGetter(option).toLowerCase() : '';
        return text.includes(preferred) || value.includes(preferred);
    }) || null;
}

function chooseNodeByStrategy<T>(items: T[], strategy: DropdownStrategy): T | null {
    if (items.length === 0) return null;
    if (strategy === 'second') return items[1] || items[0];
    if (strategy === 'random') return items[Math.floor(Math.random() * items.length)];
    return items[0];
}

function setElementValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
    if (descriptor?.set) {
        descriptor.set.call(element, value);
        return;
    }
    element.value = value;
}

function isGooglePlacesLikeInput(input: HTMLInputElement): boolean {
    const placeholder = (input.placeholder || '').toLowerCase();
    const className = (input.className || '').toLowerCase();
    return placeholder.includes('enter a location') || className.includes('pac-target-input');
}

async function fillPlacesAutocompleteField(input: HTMLInputElement, value: string): Promise<boolean> {
    setElementValue(input, '');
    dispatchEvents(input);
    await wait(40);

    setElementValue(input, value);
    input.focus();
    dispatchEvents(input);

    // Trigger autocomplete engines that require key events.
    for (const char of value.split('')) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: `Digit${char}`, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: char, code: `Digit${char}`, bubbles: true }));
    }

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));

    // Wait up to ~4.5s for suggestions to appear.
    for (let i = 0; i < 30; i++) {
        await wait(150);
        const options = Array.from(
            document.querySelectorAll<HTMLElement>('.pac-item, .pac-container .pac-item')
        ).filter(isElementVisible);

        if (options.length > 0) {
            options[0].click();
            await wait(140);
            dispatchEvents(input);
            return true;
        }

        // Re-trigger every few attempts for slower widgets.
        if (i === 8 || i === 16 || i === 24) {
            input.focus();
            setElementValue(input, value);
            dispatchEvents(input);
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
        }
    }

    // Try Enter only after a full wait cycle.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    dispatchEvents(input);
    return false;
}

function isAddressLookupField(fieldName: string): boolean {
    const key = (getFieldKey(fieldName) || '').toLowerCase();
    const normalized = normalizeKey(fieldName);
    const joined = `${key} ${normalized}`;
    return joined.includes('address') && !joined.includes('emailaddress');
}

function isAddressDependentField(fieldName: string): boolean {
    const key = (getFieldKey(fieldName) || '').toLowerCase();
    const normalized = normalizeKey(fieldName);
    const joined = `${key} ${normalized}`;

    return joined.includes('city') ||
        joined.includes('postcode') ||
        joined.includes('postalcode') ||
        joined.includes('zip') ||
        joined.includes('country') ||
        joined.includes('state') ||
        joined.includes('administrativearea') ||
        joined.includes('sublocality');
}

function isPhoneField(fieldName: string, input: HTMLInputElement | HTMLTextAreaElement): boolean {
    if (input instanceof HTMLInputElement && input.type === 'tel') return true;
    const key = (getFieldKey(fieldName) || '').toLowerCase();
    const normalized = normalizeKey(fieldName);
    const joined = `${key} ${normalized}`;
    return joined.includes('phone') || joined.includes('mobile') || joined.includes('tel');
}

function shouldSkipInputElement(input: HTMLInputElement | HTMLTextAreaElement): boolean {
    const overlaySelector = '.cdk-overlay-container, .mat-select-panel, .mat-autocomplete-panel, .pac-container, .iti__country-list, .iti__search-container';
    return Boolean(input.closest(overlaySelector));
}

async function setIntlCountryCode(input: HTMLInputElement, iso: string): Promise<void> {
    const itiContainer = input.closest('.iti');
    if (!itiContainer) return;

    const selectedFlag = itiContainer.querySelector<HTMLElement>('.iti__selected-flag, .iti__selected-country');
    if (!selectedFlag) return;

    selectedFlag.click();
    await wait(120);

    const countryOption = document.querySelector<HTMLElement>(`.iti__country[data-country-code="${iso}"]`);
    if (countryOption) {
        countryOption.click();
        await wait(80);
    } else {
        document.body.click();
    }
}

async function fillPhoneField(input: HTMLInputElement): Promise<void> {
    await setIntlCountryCode(input, KG_COUNTRY_ISO);

    if (input.closest('.iti')) {
        setElementValue(input, KG_LOCAL_PHONE);
    } else {
        setElementValue(input, `${KG_DIAL}${KG_LOCAL_PHONE}`);
    }
    dispatchEvents(input);
}

function isDateLikeField(fieldName: string, input: HTMLInputElement | HTMLTextAreaElement): boolean {
    const key = (getFieldKey(fieldName) || '').toLowerCase();
    const normalized = normalizeKey(fieldName);
    const joined = `${key} ${normalized}`;
    if (input instanceof HTMLInputElement && input.type === 'date') return true;
    return joined.includes('date') || joined.includes('birth') || joined.includes('dob') || joined.includes('ptdate');
}

async function fillDateWithCalendar(input: HTMLInputElement | HTMLTextAreaElement, fallbackValue: string): Promise<void> {
    const root = input.closest('mat-form-field, .mat-mdc-form-field, .mat-form-field, .form-group, .field') || input.parentElement;
    const toggle = root?.querySelector<HTMLElement>('mat-datepicker-toggle button, button[aria-label*="calendar" i], button[aria-label*="date" i], .mat-datepicker-toggle button');

    if (toggle) {
        toggle.click();
        await wait(180);

        const dayCell = document.querySelector<HTMLElement>(
            '.cdk-overlay-container .mat-calendar-body-cell:not(.mat-calendar-body-disabled) .mat-calendar-body-cell-content'
        );
        if (dayCell) {
            dayCell.click();
            await wait(120);
            dispatchEvents(input as HTMLElement);
            return;
        }
    }

    if (!currentSettings?.dryRun) {
        setElementValue(input as HTMLInputElement | HTMLTextAreaElement, fallbackValue);
        dispatchEvents(input as HTMLElement);
    }
}

function chooseNativeOption(
    select: HTMLSelectElement,
    strategy: DropdownStrategy,
    fieldName: string,
    preferredValue: string
): HTMLOptionElement | null {
    const options = Array.from(select.options).filter((option) => !option.disabled && !option.hidden);
    if (options.length === 0) return null;

    const candidates = options.filter((option) => {
        const text = option.text.toLowerCase().trim();
        const value = option.value.toLowerCase().trim();
        if (!text && !value) return false;
        if (option.hasAttribute('placeholder')) return false;
        return !isPlaceholderLike(text);
    });
    const real = candidates.length > 0 ? candidates : options;

    const english = isLanguageField(fieldName) ? findEnglishOption(real, (option) => option.textContent || '') : null;
    if (english) return english as HTMLOptionElement;

    const ranked = findRankedOption(real, fieldName, (option) => option.textContent || '');
    if (ranked) return ranked as HTMLOptionElement;

    const preferred = findPreferredOption(real, preferredValue, (option) => option.textContent || '', (option) => option.value);
    if (preferred) return preferred as HTMLOptionElement;

    return chooseNodeByStrategy(real, strategy) as HTMLOptionElement | null;
}

function getMatSelectTriggers(): HTMLElement[] {
    const selectors = ['mat-select', '.mat-mdc-select', '.mat-select', '[role="combobox"][aria-haspopup="listbox"]'];
    const elements = selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)));
    const unique = new Set<HTMLElement>();
    elements.forEach((element) => {
        if (!element.closest('.cdk-overlay-container')) unique.add(element);
    });
    return Array.from(unique);
}

function getMatOptionCandidates(): HTMLElement[] {
    const options = Array.from(document.querySelectorAll<HTMLElement>('.cdk-overlay-pane mat-option, .cdk-overlay-pane [role="option"]'));
    return options.filter((option) => {
        if (!isElementVisible(option)) return false;
        if (option.getAttribute('aria-disabled') === 'true') return false;
        if (option.classList.contains('mat-option-disabled') || option.classList.contains('mdc-list-item--disabled')) return false;
        return !isPlaceholderLike(textForElement(option));
    });
}

function resolveFieldValue(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    fieldName: string,
    inputType: string,
    profileData: ProfileData,
    learnedAnswers: LearnedAnswers,
    learnedContexts: LearnedContextRecord[],
    recipe: FormRecipe | null
): { value: string; source: FillSource } {
    const key = getFieldKey(fieldName);
    const candidates = getFieldCandidates(element, fieldName);
    const stepKey = getStepKeyForElement(element);
    const sectionKey = getSectionKeyForElement(element);
    const urlPattern = getCurrentUrlPattern();

    const contextValue = findLearnedContextValue(
        learnedContexts,
        currentFormType,
        urlPattern,
        stepKey,
        sectionKey,
        candidates
    );
    if (contextValue) {
        return { value: contextValue, source: 'learned' };
    }

    if (key === 'firstName' || key === 'lastName' || key === 'fullName') {
        const slotIndex = getEntityNameSlotIndex(fieldName);
        const selected = currentNameSlots[slotIndex] || currentNameSlots[0];
        if (selected) {
            if (key === 'firstName') {
                return { value: selected.firstName, source: 'mapped' };
            }
            if (key === 'lastName') {
                return { value: selected.lastName, source: 'mapped' };
            }
            return { value: `${selected.firstName} ${selected.lastName}`, source: 'mapped' };
        }
    }

    if (key && learnedAnswers[key]) {
        return { value: learnedAnswers[key], source: 'learned' };
    }

    if (recipe && key && recipe.fieldOverrides[key]) {
        return { value: recipe.fieldOverrides[key], source: 'mapped' };
    }

    if (key && profileData[key]) {
        return { value: profileData[key], source: 'mapped' };
    }

    for (const candidate of candidates) {
        const guessedKey = getFieldKey(candidate);
        if (guessedKey && learnedAnswers[guessedKey]) {
            return { value: learnedAnswers[guessedKey], source: 'learned' };
        }
        if (guessedKey && profileData[guessedKey]) {
            return { value: profileData[guessedKey], source: 'mapped' };
        }
    }

    return { value: getFieldValue(fieldName, profileData, inputType), source: 'fallback' };
}

function highlight(element: HTMLElement): void {
    element.style.backgroundColor = '#e8f0fe';
}

function dispatchEvents(element: HTMLElement) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function createDefaultUploadFiles(): File[] {
    // Small valid 1x1 PNG (preferred by many ET document validators).
    const onePixelPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7G8jQAAAAASUVORK5CYII=';
    const binary = atob(onePixelPngBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    const png = new File([bytes], 'qa-default-upload.png', { type: 'image/png' });
    return [png];
}

function assignFilesToInput(input: HTMLInputElement, files: File[]): boolean {
    try {
        const transfer = new DataTransfer();
        const selected = input.multiple ? files : [files[0]];
        selected.forEach((file) => transfer.items.add(file));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    } catch (error) {
        console.error('Failed to assign files:', error);
        return false;
    }
}

function isDocumentUploadContext(input: HTMLInputElement): boolean {
    const contextText = (input.closest('section, .step, .form-group, .mat-step-content, .dropzone, .upload')?.textContent || '').toLowerCase();
    const labelText = (
        input.getAttribute('name') ||
        input.getAttribute('id') ||
        input.getAttribute('aria-label') ||
        input.getAttribute('data-testid') ||
        ''
    ).toLowerCase();
    const joined = `${contextText} ${labelText}`;
    return joined.includes('document') || joined.includes('upload') || joined.includes('court order') || joined.includes('file');
}

function uploadDefaultDocuments(): number {
    const fileInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))
        .filter((input) => !input.disabled);

    let uploaded = 0;
    const files = createDefaultUploadFiles();

    fileInputs.forEach((input) => {
        if (input.files && input.files.length > 0) {
            return;
        }
        if (!isDocumentUploadContext(input)) {
            return;
        }

        if (currentSettings?.dryRun) {
            uploaded++;
            appendReportDetail('dry-run upload documents');
            return;
        }

        const success = assignFilesToInput(input, files);
        if (success) {
            uploaded++;
            appendReportDetail(`uploaded default document via ${input.name || input.id || 'file-input'}`);
        }
    });

    return uploaded;
}

function drawSignatureOnCanvas(canvas: HTMLCanvasElement): boolean {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const width = canvas.width || canvas.clientWidth || 320;
    const height = canvas.height || canvas.clientHeight || 120;
    if (!canvas.width) canvas.width = width;
    if (!canvas.height) canvas.height = height;

    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const points = [
        [width * 0.08, height * 0.65],
        [width * 0.23, height * 0.35],
        [width * 0.42, height * 0.62],
        [width * 0.6, height * 0.28],
        [width * 0.8, height * 0.58]
    ];

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.stroke();

    canvas.dispatchEvent(new Event('input', { bubbles: true }));
    canvas.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function fillSignaturePads(): number {
    const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas'));
    let filled = 0;

    canvases.forEach((canvas) => {
        if (!isElementVisible(canvas)) return;
        if (canvas.closest('.cdk-overlay-container')) return;

        const contextText = (canvas.closest('section, .step, .mat-step-content, .form-group')?.textContent || '').toLowerCase();
        if (!contextText.includes('signature') && !contextText.includes('sign')) {
            return;
        }

        if (!currentSettings?.dryRun) {
            const ok = drawSignatureOnCanvas(canvas);
            if (ok) {
                highlight(canvas);
                filled++;
            }
        } else {
            filled++;
        }
    });

    if (filled > 0) {
        appendReportDetail(`signature pads filled: ${filled}`);
    }
    return filled;
}

function isElementDisabled(element: HTMLElement): boolean {
    if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        return element.disabled;
    }
    return element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('disabled');
}

function isNextStepperButton(element: HTMLElement): boolean {
    if (!isElementVisible(element) || isElementDisabled(element)) return false;
    if (element.hasAttribute('matsteppernext') || element.hasAttribute('cdksteppernext')) return true;
    const text = textForElement(element).toLowerCase();
    const positive = ['next', 'continue', 'proceed', 'далее', 'следующий', 'продолжить'];
    const negative = ['back', 'previous', 'prev', 'назад', 'submit', 'send', 'finish', 'complete', 'register', 'apply'];
    if (negative.some((marker) => text.includes(marker))) return false;
    return positive.some((marker) => text.includes(marker));
}

function clickNextStepperButton(): boolean {
    const explicit = Array.from(document.querySelectorAll<HTMLElement>('[matsteppernext], [cdksteppernext]'))
        .find((button) => isElementVisible(button) && !isElementDisabled(button));
    if (explicit) {
        if (!currentSettings?.dryRun) {
            explicit.click();
            dispatchEvents(explicit);
        }
        return true;
    }

    const allButtons = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], a[role="button"], .mat-stepper-next'));
    const nextButton = allButtons.find(isNextStepperButton);
    if (!nextButton) return false;

    if (!currentSettings?.dryRun) {
        nextButton.click();
        dispatchEvents(nextButton);
    }
    return true;
}

async function waitForStepperTransition(): Promise<void> {
    await new Promise<void>((resolve) => {
        let done = false;
        const timeout = window.setTimeout(() => {
            if (done) return;
            done = true;
            observer.disconnect();
            resolve();
        }, 2200);

        const observer = new MutationObserver((mutations) => {
            const hasMeaningfulChange = mutations.some((mutation) =>
                mutation.addedNodes.length > 0 ||
                mutation.removedNodes.length > 0 ||
                mutation.type === 'attributes'
            );
            if (!hasMeaningfulChange || done) return;
            done = true;
            window.clearTimeout(timeout);
            observer.disconnect();
            resolve();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'aria-hidden', 'aria-expanded']
        });
    });
}

async function closeOpenOverlayPanels(): Promise<void> {
    const backdropSelectors = ['.cdk-overlay-backdrop.cdk-overlay-backdrop-showing', '.cdk-overlay-backdrop'];
    for (const selector of backdropSelectors) {
        const backdrops = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(isElementVisible);
        if (backdrops.length === 0) continue;

        for (const backdrop of backdrops) {
            backdrop.click();
            await wait(40);
        }
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
    await wait(60);
}

async function fillMaterialSelects(
    strategy: DropdownStrategy,
    profileData: ProfileData,
    learnedAnswers: LearnedAnswers,
    learnedContexts: LearnedContextRecord[],
    recipe: FormRecipe | null
): Promise<number> {
    let filled = 0;
    const matSelects = getMatSelectTriggers();

    for (const matSelect of matSelects) {
        const isDisabled = matSelect.getAttribute('aria-disabled') === 'true' ||
            matSelect.classList.contains('mat-mdc-select-disabled') ||
            matSelect.classList.contains('mat-select-disabled');
        if (isDisabled || !isElementVisible(matSelect)) continue;

        const fieldName = getFieldName(matSelect as unknown as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement);
        if (currentAddressAutocompleteUsed && isAddressDependentField(fieldName)) {
            appendReportDetail(`skip ${fieldName}: address autocomplete owns dependent fields`);
            continue;
        }
        const preferred = resolveFieldValue(
            matSelect as unknown as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
            fieldName,
            'select',
            profileData,
            learnedAnswers,
            learnedContexts,
            recipe
        ).value;

        if (currentSettings?.dryRun) {
            filled++;
            appendReportDetail(`dry-run select ${fieldName}`);
            continue;
        }

        await closeOpenOverlayPanels();
        matSelect.click();
        dispatchEvents(matSelect);

        let options: HTMLElement[] = [];
        for (let i = 0; i < 10; i++) {
            await wait(100);
            options = getMatOptionCandidates();
            if (options.length > 0) break;
        }

        const english = isLanguageField(fieldName) ? findEnglishOption(options, textForElement) : null;
        const ranked = findRankedOption(options, fieldName, textForElement);
        const preferredOption = findPreferredOption(options, preferred, textForElement);
        const chosen = english || ranked || preferredOption || chooseNodeByStrategy(options, strategy);

        if (!chosen) {
            await closeOpenOverlayPanels();
            continue;
        }

        chosen.click();
        await wait(140);
        await closeOpenOverlayPanels();
        highlight(matSelect);
        filled++;
    }

    await closeOpenOverlayPanels();
    return filled;
}

function getElementKey(element: Element): string {
    if (element.id) return `id:${element.id}`;
    const marker = element.getAttribute('data-testid') || element.getAttribute('formcontrolname') || element.getAttribute('aria-labelledby');
    if (marker) return `attr:${marker}`;
    return `tag:${element.tagName.toLowerCase()}`;
}

function getStandaloneRadioGroupKey(radio: HTMLElement): string {
    const explicitGroup = radio.closest('[role="radiogroup"], mat-radio-group');
    if (explicitGroup) return `explicit:${getElementKey(explicitGroup)}`;
    const namedGroup = radio.getAttribute('name');
    if (namedGroup) return `name:${namedGroup}`;

    let current = radio.parentElement;
    while (current && current !== document.body) {
        const count = current.querySelectorAll('[role="radio"]').length;
        if (count > 1 && count <= 12) return `container:${getElementKey(current)}`;
        current = current.parentElement;
    }
    return `single:${getElementKey(radio)}`;
}

function fillMaterialRadioGroups(strategy: DropdownStrategy): number {
    const groups = document.querySelectorAll<HTMLElement>('mat-radio-group, [role="radiogroup"]');
    let filled = 0;

    groups.forEach((group) => {
        if (!isElementVisible(group)) return;
        const radios = Array.from(group.querySelectorAll<HTMLElement>('mat-radio-button, [role="radio"], input[type="radio"]')).filter(isElementVisible);
        if (radios.length === 0) return;
        const checked = radios.some((item) => item.getAttribute('aria-checked') === 'true' || (item instanceof HTMLInputElement && item.checked));
        if (checked) return;
        const target = chooseNodeByStrategy(radios, strategy);
        if (!target) return;

        if (!currentSettings?.dryRun) {
            const clickTarget = target.closest('mat-radio-button') || target;
            (clickTarget as HTMLElement).click();
            dispatchEvents(clickTarget as HTMLElement);
            highlight(clickTarget as HTMLElement);
        }
        filled++;
    });
    return filled;
}

function fillStandaloneAriaRadios(strategy: DropdownStrategy): number {
    const radios = Array.from(document.querySelectorAll<HTMLElement>('[role="radio"]'))
        .filter((radio) => isElementVisible(radio) && radio.getAttribute('aria-disabled') !== 'true');
    const groups = new Map<string, HTMLElement[]>();
    radios.forEach((radio) => {
        const key = getStandaloneRadioGroupKey(radio);
        const bucket = groups.get(key) || [];
        bucket.push(radio);
        groups.set(key, bucket);
    });

    let filled = 0;
    groups.forEach((groupRadios) => {
        const checked = groupRadios.some((radio) => radio.getAttribute('aria-checked') === 'true');
        if (checked) return;
        const target = chooseNodeByStrategy(groupRadios, strategy);
        if (!target) return;
        if (!currentSettings?.dryRun) {
            target.click();
            dispatchEvents(target);
            highlight(target);
        }
        filled++;
    });
    return filled;
}

function turnOnAriaToggles(denylist: string[]): number {
    const toggles = document.querySelectorAll<HTMLElement>('[role="switch"], [role="checkbox"]');
    let toggledCount = 0;

    toggles.forEach((toggle) => {
        if (toggle.closest('mat-radio-group, [role="radiogroup"]')) return;
        const isDisabled = toggle.getAttribute('aria-disabled') === 'true';
        const ariaChecked = toggle.getAttribute('aria-checked');
        const label = textForElement(toggle).toLowerCase();
        const blocked = denylist.some((entry) => label.includes(entry));
        if (!isElementVisible(toggle) || isDisabled || blocked || ariaChecked === 'true') return;
        if (!currentSettings?.dryRun) {
            toggle.click();
            dispatchEvents(toggle);
            highlight(toggle);
        }
        toggledCount++;
    });
    return toggledCount;
}

function fillConsentCheckboxes(): number {
    let toggled = 0;

    // 1) Native checkboxes (including hidden inputs used by UI wrappers).
    const nativeCheckboxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
        .filter((input) => !input.disabled && !input.checked);

    nativeCheckboxes.forEach((input) => {
        if (currentSettings?.dryRun) {
            toggled++;
            return;
        }

        const clickable =
            (input.labels && input.labels[0]) ||
            input.closest('label') ||
            input.closest('mat-checkbox, .mat-mdc-checkbox, .mat-checkbox, .mdc-checkbox, .checkbox');

        if (clickable && clickable instanceof HTMLElement) {
            clickable.click();
            dispatchEvents(clickable);
        } else {
            input.checked = true;
            dispatchEvents(input);
        }

        highlight((clickable as HTMLElement) || input);
        toggled++;
    });

    // 2) ARIA checkbox wrappers that may not expose native input cleanly.
    const ariaCheckboxes = Array.from(document.querySelectorAll<HTMLElement>('[role="checkbox"]'))
        .filter((el) =>
            el.getAttribute('aria-checked') !== 'true' &&
            el.getAttribute('aria-disabled') !== 'true' &&
            isElementVisible(el)
        );

    ariaCheckboxes.forEach((checkbox) => {
        if (checkbox.closest('mat-radio-group, [role="radiogroup"]')) return;

        if (!currentSettings?.dryRun) {
            checkbox.click();
            dispatchEvents(checkbox);
            highlight(checkbox);
        }
        toggled++;
    });

    if (toggled > 0) {
        appendReportDetail(`consent checkboxes toggled: ${toggled}`);
    }

    return toggled;
}

function collectInvalidCount(): number {
    const invalidElements = document.querySelectorAll(
        '[aria-invalid="true"], .ng-invalid, mat-form-field.ng-invalid, .mat-mdc-form-field-error-wrapper'
    );
    return invalidElements.length;
}

function getInputTargets(): Array<HTMLInputElement | HTMLTextAreaElement> {
    return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]), textarea'
    ));
}

async function fillInputs(
    profileData: ProfileData,
    learnedAnswers: LearnedAnswers,
    learnedContexts: LearnedContextRecord[],
    recipe: FormRecipe | null,
    forceInvalidOnly = false
): Promise<number> {
    const inputs = getInputTargets();
    const handledRadioGroups = new Set<string>();
    let filled = 0;

    for (const input of inputs) {
        if (input.disabled || input.readOnly) continue;
        if (shouldSkipInputElement(input)) continue;
        if (forceInvalidOnly && input.getAttribute('aria-invalid') !== 'true' && !input.classList.contains('ng-invalid')) {
            continue;
        }

        if (input instanceof HTMLInputElement && input.type === 'checkbox') {
            if (!input.checked) {
                if (!currentSettings?.dryRun) {
                    input.checked = true;
                    dispatchEvents(input);
                    highlight(input);
                }
                filled++;
            }
            continue;
        }

        if (input instanceof HTMLInputElement && input.type === 'radio') {
            const group = input.name || input.id || `radio-${Math.random()}`;
            if (handledRadioGroups.has(group)) continue;
            if (!currentSettings?.dryRun) {
                input.checked = true;
                dispatchEvents(input);
                highlight(input);
            }
            filled++;
            handledRadioGroups.add(group);
            continue;
        }

        if (!forceInvalidOnly && !isEmptyValue(input.value || '')) continue;

        const fieldName = getFieldName(input);
        if (currentAddressAutocompleteUsed && isAddressDependentField(fieldName)) {
            appendReportDetail(`skip ${fieldName}: address autocomplete owns dependent fields`);
            continue;
        }
        const resolved = resolveFieldValue(
            input,
            fieldName,
            input.type,
            profileData,
            learnedAnswers,
            learnedContexts,
            recipe
        );
        if (!resolved.value) continue;

        if (!currentSettings?.dryRun) {
            if (input instanceof HTMLInputElement && isPhoneField(fieldName, input)) {
                await fillPhoneField(input);
                appendReportDetail(`phone forced to ${KG_DIAL}${KG_LOCAL_PHONE}`);
            } else if (input instanceof HTMLInputElement && isGooglePlacesLikeInput(input) && isAddressLookupField(fieldName)) {
                const selected = await fillPlacesAutocompleteField(input, ADDRESS_LOOKUP_QUERY);
                if (selected) {
                    currentAddressAutocompleteUsed = true;
                    appendReportDetail(`address lookup used query "${ADDRESS_LOOKUP_QUERY}" and selected first suggestion`);
                }
            } else if (isDateLikeField(fieldName, input)) {
                await fillDateWithCalendar(input, resolved.value);
            } else {
                setElementValue(input, resolved.value);
            }
            dispatchEvents(input);
            highlight(input);
        }
        appendReportDetail(`fill ${fieldName} via ${resolved.source}`);
        filled++;
    }
    return filled;
}

function fillNativeSelects(
    profileData: ProfileData,
    learnedAnswers: LearnedAnswers,
    learnedContexts: LearnedContextRecord[],
    recipe: FormRecipe | null,
    strategy: DropdownStrategy
): number {
    const selects = document.querySelectorAll<HTMLSelectElement>('select');
    let filled = 0;
    selects.forEach((select) => {
        if (select.disabled) return;
        const fieldName = getFieldName(select);
        if (currentAddressAutocompleteUsed && isAddressDependentField(fieldName)) {
            appendReportDetail(`skip ${fieldName}: address autocomplete owns dependent fields`);
            return;
        }
        const preferred = resolveFieldValue(
            select,
            fieldName,
            'select',
            profileData,
            learnedAnswers,
            learnedContexts,
            recipe
        ).value;
        const option = chooseNativeOption(select, strategy, fieldName, preferred);
        if (!option) return;

        if (!currentSettings?.dryRun) {
            select.value = option.value;
            dispatchEvents(select);
            highlight(select);
        }
        filled++;
    });
    return filled;
}

async function fillCurrentPage(
    profileData: ProfileData,
    learnedAnswers: LearnedAnswers,
    learnedContexts: LearnedContextRecord[],
    recipe: FormRecipe | null,
    strategy: DropdownStrategy
): Promise<number> {
    let filled = 0;
    const denylist = parseDenylist(currentSettings?.toggleDenylist || DEFAULT_TOGGLE_DENYLIST);

    // Pass 1: fill what's visible immediately.
    filled += await fillInputs(profileData, learnedAnswers, learnedContexts, recipe, false);
    filled += fillNativeSelects(profileData, learnedAnswers, learnedContexts, recipe, strategy);
    filled += await fillMaterialSelects(strategy, profileData, learnedAnswers, learnedContexts, recipe);
    filled += fillMaterialRadioGroups(strategy);
    filled += fillStandaloneAriaRadios(strategy);
    filled += turnOnAriaToggles(denylist);
    filled += fillSignaturePads();
    filled += fillConsentCheckboxes();
    filled += uploadDefaultDocuments();

    // Pass 2: some controls become visible only after radio/checkbox/select interactions.
    filled += await fillInputs(profileData, learnedAnswers, learnedContexts, recipe, false);
    filled += fillNativeSelects(profileData, learnedAnswers, learnedContexts, recipe, strategy);
    filled += await fillMaterialSelects(strategy, profileData, learnedAnswers, learnedContexts, recipe);

    return filled;
}

async function retryInvalidFields(
    profileData: ProfileData,
    learnedAnswers: LearnedAnswers,
    learnedContexts: LearnedContextRecord[],
    recipe: FormRecipe | null,
    strategy: DropdownStrategy
): Promise<number> {
    let retried = 0;
    retried += await fillInputs(profileData, learnedAnswers, learnedContexts, recipe, true);
    retried += fillNativeSelects(profileData, learnedAnswers, learnedContexts, recipe, strategy);
    retried += await fillMaterialSelects(strategy, profileData, learnedAnswers, learnedContexts, recipe);
    return retried;
}

function clickSubmitButton(): boolean {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"], a[role="button"]'));
    const target = buttons.find((button) => {
        if (!isElementVisible(button) || isElementDisabled(button)) return false;
        const text = textForElement(button).toLowerCase();
        return ['submit', 'send', 'finish', 'complete', 'register', 'apply', 'отправить', 'завершить'].some((word) => text.includes(word));
    });
    if (!target) return false;
    if (!currentSettings?.dryRun) {
        target.click();
        dispatchEvents(target);
    }
    return true;
}

async function fillAllStepperPages(
    profileData: ProfileData,
    learnedAnswers: LearnedAnswers,
    learnedContexts: LearnedContextRecord[],
    recipe: FormRecipe | null,
    strategy: DropdownStrategy
): Promise<{ filled: number; steps: number }> {
    let totalFilled = 0;
    let traversed = 1;
    const maxSteps = 20;
    for (let i = 0; i < maxSteps; i++) {
        totalFilled += await fillCurrentPage(profileData, learnedAnswers, learnedContexts, recipe, strategy);
        const moved = clickNextStepperButton();
        if (!moved) break;
        traversed++;
        await waitForStepperTransition();
        await wait(250);
    }
    return { filled: totalFilled, steps: traversed };
}

async function fillForms(
    profileType: string,
    formType: string,
    dropdownStrategy: string,
    overrides?: Partial<AutofillSettings>
): Promise<{ filledCount: number; report: AutofillReport }> {
    const stored = await getAutofillSettings();
    currentSettings = {
        ...stored,
        ...overrides
    };
    currentAddressAutocompleteUsed = false;
    const strategy = normalizeDropdownStrategy(currentSettings.dropdownStrategy);
    const matchedRecipe = getRecipeByUrl(window.location.pathname);
    const recipeFormType = matchedRecipe?.formType || '';
    currentFormType = detectFormType(recipeFormType || formType || currentSettings.formType);
    attachLearningListeners();

    const learnedByForm = await getLearnedByForm();
    const learnedAnswers = learnedByForm[currentFormType] || {};
    const learnedContexts = await getLearnedContextRecords();
    const baseProfileData = buildProfileData(profileType || currentSettings.profileType, currentFormType);
    const recentNameSets = await getRecentNameSets();
    const mergedNameSets = buildNameSlots([
        {
            firstName: baseProfileData.firstName || 'John',
            lastName: baseProfileData.lastName || 'Doe',
            updatedAt: Date.now()
        },
        ...recentNameSets
    ]);
    currentNameSlots = mergedNameSets;
    await saveRecentNameSets(mergedNameSets);

    const profileData: ProfileData = {
        ...baseProfileData,
        ...(matchedRecipe?.fieldOverrides || {}),
        ...learnedAnswers,
        ...(currentSettings.fieldOverrides || {})
    };

    currentReport = {
        startedAt: new Date().toISOString(),
        formType: currentFormType,
        dryRun: currentSettings.dryRun,
        stepsTraversed: 1,
        filled: 0,
        retried: 0,
        invalidAfterRetry: 0,
        details: []
    };

    const { filled, steps } = await fillAllStepperPages(
        profileData,
        learnedAnswers,
        learnedContexts,
        matchedRecipe,
        strategy
    );
    currentReport.filled = filled;
    currentReport.stepsTraversed = steps;

    const retried = await retryInvalidFields(profileData, learnedAnswers, learnedContexts, matchedRecipe, strategy);
    currentReport.retried = retried;
    currentReport.invalidAfterRetry = collectInvalidCount();

    if (currentSettings.autoSubmit) {
        const submitted = clickSubmitButton();
        appendReportDetail(submitted ? 'auto-submit clicked' : 'auto-submit requested but no button found');
    }

    if (currentSettings.debugMode && currentReport) {
        console.log('QA Autofill report:', currentReport);
    }
    if (currentReport) {
        await setStorage({ [LAST_REPORT_STORAGE_KEY]: currentReport });
    }
    return {
        filledCount: currentReport.filled,
        report: currentReport
    };
}

function initAutoPopupWatcher(): void {
    const run = () => void maybeShowAutoPopup();
    run();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    }
    window.addEventListener('load', run, { once: true });
    window.addEventListener('popstate', run);
    window.addEventListener('hashchange', run);

    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = function (...args) {
        const result = originalPushState(...args);
        setTimeout(run, 0);
        return result;
    };
    history.replaceState = function (...args) {
        const result = originalReplaceState(...args);
        setTimeout(run, 0);
        return result;
    };

    let attempts = 0;
    const timer = window.setInterval(() => {
        attempts++;
        run();
        if (attempts >= 20) window.clearInterval(timer);
    }, 1000);
}

initAutoPopupWatcher();
