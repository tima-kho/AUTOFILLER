document.addEventListener('DOMContentLoaded', () => {
    const profileSelect = document.getElementById('profileSelect') as HTMLSelectElement;
    const dropdownStrategySelect = document.getElementById('dropdownStrategySelect') as HTMLSelectElement;
    const moreBtn = document.getElementById('moreBtn') as HTMLButtonElement;
    const advancedSection = document.getElementById('advancedSection') as HTMLDivElement;
    const autoSubmitToggle = document.getElementById('autoSubmitToggle') as HTMLInputElement;
    const dryRunToggle = document.getElementById('dryRunToggle') as HTMLInputElement;
    const debugModeToggle = document.getElementById('debugModeToggle') as HTMLInputElement;
    const toggleDenylistInput = document.getElementById('toggleDenylistInput') as HTMLInputElement;
    const fieldOverridesInput = document.getElementById('fieldOverridesInput') as HTMLTextAreaElement;
    const fillBtn = document.getElementById('fillBtn') as HTMLButtonElement;
    const refreshLearnedBtn = document.getElementById('refreshLearnedBtn') as HTMLButtonElement;
    const resetLearnedBtn = document.getElementById('resetLearnedBtn') as HTMLButtonElement;
    const exportConfigBtn = document.getElementById('exportConfigBtn') as HTMLButtonElement;
    const importConfigBtn = document.getElementById('importConfigBtn') as HTMLButtonElement;
    const learnedOutput = document.getElementById('learnedOutput') as HTMLTextAreaElement;
    const configDataInput = document.getElementById('configDataInput') as HTMLTextAreaElement;
    const reportOutput = document.getElementById('reportOutput') as HTMLTextAreaElement;

    const DEFAULT_DENYLIST = 'none,no,not applicable,prefer not,decline';

    const normalizeOverrideKey = (key: string): string => {
        const normalized = key.trim().toLowerCase();
        if (normalized === 'name' || normalized === 'firstname' || normalized === 'first_name') return 'firstName';
        if (normalized === 'lastname' || normalized === 'last_name' || normalized === 'surname') return 'lastName';
        if (normalized === 'fullname' || normalized === 'full_name') return 'fullName';
        if (normalized === 'mail') return 'email';
        if (normalized === 'tel' || normalized === 'mobilephone') return 'mobile';
        return key.trim();
    };

    const parseFieldOverrides = (raw: string): Record<string, string> => {
        const output: Record<string, string> = {};
        raw.split('\n').forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;

            let splitIndex = trimmed.indexOf('=');
            if (splitIndex <= 0) splitIndex = trimmed.indexOf(':');
            if (splitIndex <= 0) splitIndex = trimmed.indexOf(' - ');
            if (splitIndex <= 0) splitIndex = trimmed.indexOf('-');
            if (splitIndex <= 0) return;

            const keyRaw = trimmed.slice(0, splitIndex).trim();
            const value = trimmed.slice(splitIndex + 1).trim();
            const key = normalizeOverrideKey(keyRaw);
            if (!key || !value) return;
            output[key] = value;
        });
        return output;
    };

    const saveFieldOverrides = () => {
        const text = fieldOverridesInput.value || '';
        chrome.storage.local.set({
            selectedFieldOverridesText: text,
            selectedFieldOverrides: parseFieldOverrides(text)
        });
    };

    const refreshLearnedAndReport = () => {
        chrome.storage.local.get(['learnedFieldAnswersByForm', 'lastAutofillReport'], (result) => {
            learnedOutput.value = JSON.stringify(result.learnedFieldAnswersByForm || {}, null, 2);
            reportOutput.value = JSON.stringify(result.lastAutofillReport || {}, null, 2);
        });
    };

    // Load saved settings
    chrome.storage.local.get([
        'selectedProfile',
        'selectedDropdownStrategy',
        'selectedAutoSubmit',
        'selectedDryRun',
        'selectedDebugMode',
        'selectedToggleDenylist',
        'selectedFieldOverridesText',
        'selectedFieldOverrides',
        'selectedAdvancedOpen'
    ], (result) => {
        if (result.selectedProfile) {
            profileSelect.value = result.selectedProfile;
        }
        if (result.selectedDropdownStrategy) {
            dropdownStrategySelect.value = result.selectedDropdownStrategy;
        }
        autoSubmitToggle.checked = Boolean(result.selectedAutoSubmit);
        dryRunToggle.checked = Boolean(result.selectedDryRun);
        debugModeToggle.checked = Boolean(result.selectedDebugMode);
        toggleDenylistInput.value = result.selectedToggleDenylist || DEFAULT_DENYLIST;
        fieldOverridesInput.value = result.selectedFieldOverridesText ||
            Object.entries((result.selectedFieldOverrides as Record<string, string>) || {})
                .map(([k, v]) => `${k}=${v}`)
                .join('\n');

        const advancedOpen = Boolean(result.selectedAdvancedOpen);
        advancedSection.className = advancedOpen ? 'advanced-expanded' : 'advanced-collapsed';
        moreBtn.textContent = advancedOpen ? 'Less' : 'More';
    });
    refreshLearnedAndReport();

    moreBtn.addEventListener('click', () => {
        const isOpen = advancedSection.classList.contains('advanced-expanded');
        const nextOpen = !isOpen;
        advancedSection.className = nextOpen ? 'advanced-expanded' : 'advanced-collapsed';
        moreBtn.textContent = nextOpen ? 'Less' : 'More';
        chrome.storage.local.set({ selectedAdvancedOpen: nextOpen });
    });

    profileSelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        chrome.storage.local.set({ selectedProfile: target.value });
    });

    dropdownStrategySelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        chrome.storage.local.set({ selectedDropdownStrategy: target.value });
    });

    autoSubmitToggle.addEventListener('change', () => {
        chrome.storage.local.set({ selectedAutoSubmit: autoSubmitToggle.checked });
    });

    dryRunToggle.addEventListener('change', () => {
        chrome.storage.local.set({ selectedDryRun: dryRunToggle.checked });
    });

    debugModeToggle.addEventListener('change', () => {
        chrome.storage.local.set({ selectedDebugMode: debugModeToggle.checked });
    });

    toggleDenylistInput.addEventListener('blur', () => {
        chrome.storage.local.set({ selectedToggleDenylist: toggleDenylistInput.value || DEFAULT_DENYLIST });
    });
    fieldOverridesInput.addEventListener('blur', saveFieldOverrides);

    fillBtn.addEventListener('click', () => {
        const fieldOverrides = parseFieldOverrides(fieldOverridesInput.value || '');
        saveFieldOverrides();

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab && activeTab.id) {
                chrome.tabs.sendMessage(activeTab.id, {
                    action: "FILL_FORM",
                    profileType: profileSelect.value,
                    dropdownStrategy: dropdownStrategySelect.value,
                    autoSubmit: autoSubmitToggle.checked,
                    dryRun: dryRunToggle.checked,
                    debugMode: debugModeToggle.checked,
                    toggleDenylist: toggleDenylistInput.value || DEFAULT_DENYLIST,
                    fieldOverrides
                }, () => {
                    refreshLearnedAndReport();
                });
            }
        });
    });

    refreshLearnedBtn.addEventListener('click', () => refreshLearnedAndReport());

    resetLearnedBtn.addEventListener('click', () => {
        chrome.storage.local.set({ learnedFieldAnswersByForm: {} }, () => refreshLearnedAndReport());
    });

    exportConfigBtn.addEventListener('click', () => {
        chrome.storage.local.get(null, (all) => {
            const payload = {
                selectedProfile: all.selectedProfile,
                selectedDropdownStrategy: all.selectedDropdownStrategy,
                selectedAutoSubmit: all.selectedAutoSubmit,
                selectedDryRun: all.selectedDryRun,
                selectedDebugMode: all.selectedDebugMode,
                selectedToggleDenylist: all.selectedToggleDenylist,
                selectedFieldOverridesText: all.selectedFieldOverridesText,
                selectedFieldOverrides: all.selectedFieldOverrides,
                autoPopupHosts: all.autoPopupHosts,
                learnedFieldAnswersByForm: all.learnedFieldAnswersByForm
            };
            configDataInput.value = JSON.stringify(payload, null, 2);
        });
    });

    importConfigBtn.addEventListener('click', () => {
        try {
            const parsed = JSON.parse(configDataInput.value || '{}') as Record<string, unknown>;
            chrome.storage.local.set(parsed, () => {
                refreshLearnedAndReport();
            });
        } catch (error) {
            reportOutput.value = `Import error: ${(error as Error).message}`;
        }
    });
});
