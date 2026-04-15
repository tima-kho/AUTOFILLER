import { faker } from '@faker-js/faker';

export interface ProfileData {
    [key: string]: string;
}

export const FORM_TYPES = ['application', 'event', 'signup', 'general'] as const;
export type FormType = typeof FORM_TYPES[number];

export const PROFILE_TYPES = ['random', 'default'] as const;
export type ProfileType = typeof PROFILE_TYPES[number];

type FormTemplateGroup = 'applicationEvent' | 'signupGeneral';

const FORM_GROUP_BY_TYPE: Record<FormType, FormTemplateGroup> = {
    application: 'applicationEvent',
    event: 'applicationEvent',
    signup: 'signupGeneral',
    general: 'signupGeneral'
};

const defaultFormTemplates: Record<FormTemplateGroup, ProfileData> = {
    applicationEvent: {
        salutation: 'Mr',
        salutationId: '1',
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe',
        genderId: '1',
        relationshipId: '1',
        email: 'qa.default@test.com',
        phone: '+996777777777',
        mobile: '+996777777777',
        homePhone: '+996777777777',
        workPhone: '+996777777777',
        communicationPreference: '1',
        dateOfBirth: '1998-09-15',
        company: 'QA Academy',
        jobTitle: 'Student',
        schoolName: 'QA Test School',
        programName: 'Computer Science',
        enrollmentTerm: 'Fall 2026',
        eventName: 'Open Day',
        eventCampusId: '1',
        eventId: '1',
        eventTypeAndDate: '1',
        subTours: '1',
        eventDate: '2026-07-10',
        totalAttendees: '2',
        attendeeCount: '1',
        addressLine1: '123 Test Street',
        address: '123 Test Street',
        addressLine2: 'Unit 5',
        city: 'Testville',
        state: 'California',
        postalCode: '12345',
        postCode: '12345',
        country: 'United States',
        nationality: 'American',
        notes: 'Filled by QA form template',
        description: 'Autofilled test record',
        message: 'Filled by QA form template',
        alumniId: 'ALUM123',
        graduationYear: '2020',
        nameAtSchool: 'John Tester',
        personalTourRequested: '1',
        ptDate: '2026-05-01',
        sendProspectus: '1',
        sendProspectusContact2: '1',
        sendConfirmationContact2: '1',
        isSpouse: '1',
        isFirstVisit: '1',
        sublocality: 'Test Sublocality',
        administrativeAreaId: '1',
        countryId: '1',
        familyConnectionId: '1',
        familyCircumstancesIds: '1',
        familyTypeIds: '1',
        geographicStatusId: '1',
        mainLanguageId: '1',
        studentResidenceId: '1',
        siblingsId: '0',
        hasFutureSiblings: '1',
        hearAboutUsId: '1',
        password: 'Test@1234!'
    },
    signupGeneral: {
        firstName: 'Jane',
        lastName: 'Tester',
        fullName: 'Jane Tester',
        salutationId: '1',
        genderId: '1',
        relationshipId: '1',
        email: 'qa.default@test.com',
        phone: '+996777777777',
        mobile: '+996777777777',
        homePhone: '+996777777777',
        workPhone: '+996777777777',
        communicationPreference: '1',
        company: 'QA Inc',
        jobTitle: 'QA Engineer',
        addressLine1: '500 Demo Road',
        address: '500 Demo Road',
        addressLine2: 'Floor 2',
        city: 'Demoville',
        state: 'New York',
        postalCode: '10001',
        postCode: '10001',
        country: 'United States',
        website: 'https://example.com',
        notes: 'Signup/general template data',
        description: 'Full autofill dataset for signup/general form',
        message: 'Signup/general template data',
        ticketCount: '2',
        attendeeCount: '2',
        totalAttendees: '2',
        sendProspectus: '1',
        hasFutureSiblings: '1',
        hearAboutUsId: '1',
        password: 'Test@1234!',
        confirmPassword: 'Test@1234!'
    }
};

const FIELD_ALIASES: Record<string, string[]> = {
    salutation: ['salutation', 'title'],
    salutationId: ['salutationid'],
    firstName: ['firstname', 'first_name', 'givenname', 'given_name'],
    lastName: ['lastname', 'last_name', 'surname', 'familyname', 'family_name'],
    fullName: ['fullname', 'full_name', 'name'],
    nameAtSchool: ['nameatschool', 'name_at_school'],
    genderId: ['genderid', 'gender'],
    relationshipId: ['relationshipid', 'relationship'],
    email: ['email', 'mail'],
    phone: ['phone', 'phonenumber', 'telephone', 'tel'],
    mobile: ['mobile', 'mobilephone', 'cellphone', 'cell'],
    homePhone: ['homephone', 'home_phone'],
    workPhone: ['workphone', 'work_phone', 'officephone'],
    communicationPreference: ['communicationpreference', 'preferredcommunication'],
    dateOfBirth: ['dateofbirth', 'dob', 'birthdate'],
    company: ['company', 'organization', 'organisation', 'employer'],
    jobTitle: ['jobtitle', 'position', 'role'],
    schoolName: ['schoolname', 'school'],
    programName: ['programname', 'programme', 'program'],
    enrollmentTerm: ['enrollmentterm', 'enrolmentterm', 'term', 'semester', 'intake'],
    eventName: ['eventname', 'event'],
    eventCampusId: ['eventcampusid', 'campusid'],
    eventId: ['eventid'],
        eventTypeAndDate: ['eventtypeanddate', 'event_type_and_date', 'eventtype'],
    subTours: ['subtours', 'subtour'],
        eventDate: ['eventdate', 'event_type_and_date', 'eventtypeanddate'],
    ticketCount: ['ticketcount', 'tickets'],
    totalAttendees: ['totalattendees'],
        attendeeCount: [
            'attendeecount',
            'attendees',
            'participantcount',
            'howmany',
            'howmanywillbeattending',
            'attending'
        ],
    addressLine1: ['addressline1', 'address1', 'street', 'address'],
    address: ['address'],
    addressLine2: ['addressline2', 'address2', 'unit', 'apartment', 'sublocality'],
    city: ['city', 'town'],
    state: ['state', 'province', 'region', 'administrativearea'],
    postalCode: ['postalcode', 'postcode', 'postcode', 'zipcode', 'zip'],
    postCode: ['postcode'],
    country: ['country'],
    nationality: ['nationality'],
    website: ['website', 'url'],
    notes: ['notes', 'note', 'comment', 'remarks'],
    description: ['description', 'details', 'message', 'about'],
    message: ['message'],
    alumniId: ['alumniid', 'alumni_id'],
    graduationYear: ['graduationyear', 'gradyear'],
    personalTourRequested: ['personaltourrequested'],
    ptDate: ['ptdate'],
    sendProspectus: ['sendprospectus'],
    sendProspectusContact2: ['sendprospectuscontact2'],
    sendConfirmationContact2: ['sendconfirmationcontact2'],
    isSpouse: ['isspouse'],
    isFirstVisit: ['isfirstvisit'],
    administrativeAreaId: ['administrativeareaid', 'stateid', 'provinceid'],
    countryId: ['countryid'],
    familyConnectionId: ['familyconnectionid'],
    familyCircumstancesIds: ['familycircumstancesids', 'familycircumstances'],
    familyTypeIds: ['familytypeids', 'familytypes'],
    geographicStatusId: ['geographicstatusid'],
    mainLanguageId: ['mainlanguageid', 'languageid'],
    studentResidenceId: ['studentresidenceid'],
    siblingsId: ['siblingsid'],
    hasFutureSiblings: ['hasfuturesiblings'],
    hearAboutUsId: ['hearaboutusid'],
    password: ['password', 'passcode'],
    confirmPassword: ['confirmpassword', 'passwordconfirm', 'repeatpassword']
};

function normalizeValue(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

function buildRandomTemplate(group: FormTemplateGroup): ProfileData {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const fullName = `${firstName} ${lastName}`;

    const common = {
        salutation: 'Mr',
        salutationId: '1',
        firstName,
        lastName,
        fullName,
        nameAtSchool: fullName,
        genderId: '1',
        relationshipId: '1',
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        phone: '+996777777777',
        mobile: '+996777777777',
        homePhone: '+996777777777',
        workPhone: '+996777777777',
        communicationPreference: '1',
        dateOfBirth: faker.date.birthdate({ min: 18, max: 60, mode: 'age' }).toISOString().split('T')[0],
        company: faker.company.name(),
        jobTitle: faker.person.jobTitle(),
        schoolName: `${faker.location.city()} High School`,
        programName: 'Computer Science',
        enrollmentTerm: `Fall ${new Date().getFullYear() + 1}`,
        eventName: `${faker.word.adjective()} Event`,
        eventCampusId: '1',
        eventId: '1',
        eventTypeAndDate: '1',
        subTours: '1',
        eventDate: faker.date.future({ years: 1 }).toISOString().split('T')[0],
        ticketCount: '2',
        totalAttendees: '2',
        attendeeCount: '1',
        addressLine1: faker.location.streetAddress(),
        address: faker.location.streetAddress(),
        addressLine2: faker.location.secondaryAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        postalCode: faker.location.zipCode(),
        postCode: faker.location.zipCode(),
        country: faker.location.country(),
        nationality: 'American',
        website: faker.internet.url(),
        notes: faker.lorem.sentence(),
        description: faker.lorem.sentences(2),
        message: faker.lorem.sentence(),
        alumniId: faker.string.alphanumeric(8).toUpperCase(),
        graduationYear: faker.date.past({ years: 10 }).getFullYear().toString(),
        personalTourRequested: '1',
        ptDate: faker.date.future({ years: 1 }).toISOString().split('T')[0],
        sendProspectus: '1',
        sendProspectusContact2: '1',
        sendConfirmationContact2: '1',
        isSpouse: '1',
        isFirstVisit: '1',
        sublocality: faker.location.secondaryAddress(),
        administrativeAreaId: '1',
        countryId: '1',
        familyConnectionId: '1',
        familyCircumstancesIds: '1',
        familyTypeIds: '1',
        geographicStatusId: '1',
        mainLanguageId: '1',
        studentResidenceId: '1',
        siblingsId: '0',
        hasFutureSiblings: '1',
        hearAboutUsId: '1',
        password: 'Test@1234!',
        confirmPassword: 'Test@1234!'
    };

    if (group === 'applicationEvent') {
        return common;
    }

    return {
        ...common,
        programName: '',
        enrollmentTerm: '',
        alumniId: '',
        graduationYear: '',
        ptDate: ''
    };
}

function toGroup(formType: string): FormTemplateGroup {
    if (formType in FORM_GROUP_BY_TYPE) {
        return FORM_GROUP_BY_TYPE[formType as FormType];
    }
    return 'signupGeneral';
}

export function buildProfileData(profileType: string, formType: string): ProfileData {
    const group = toGroup(formType);
    if (profileType === 'random') {
        return buildRandomTemplate(group);
    }
    return defaultFormTemplates[group];
}

function resolveFieldKey(fieldName: string): string | null {
    const normalizedName = normalizeValue(fieldName);
    if (!normalizedName) return null;

    for (const [fieldKey, aliases] of Object.entries(FIELD_ALIASES)) {
        for (const alias of aliases) {
            const normalizedAlias = normalizeValue(alias);
            if (normalizedName.includes(normalizedAlias)) {
                return fieldKey;
            }
        }
    }

    return null;
}

export function getFieldKey(fieldName: string): string | null {
    return resolveFieldKey(fieldName);
}

export function getFieldValue(fieldName: string, profileData: ProfileData, inputType = ''): string {
    if (!fieldName) return '';

    const fieldKey = resolveFieldKey(fieldName);
    if (fieldKey && profileData[fieldKey] !== undefined) {
        return profileData[fieldKey];
    }

    const normalizedType = inputType.toLowerCase();
    if (normalizedType === 'email') return profileData.email || 'qa@test.com';
    if (normalizedType === 'tel') return profileData.phone || '+996777777777';
    if (normalizedType === 'url') return profileData.website || 'https://example.com';
    if (normalizedType === 'date') return profileData.ptDate || profileData.eventDate || '2026-01-01';
    if (normalizedType === 'number') return profileData.attendeeCount || '1';

    return profileData.notes || 'QA Test Data';
}

/**
 * Collects as many hints as possible for robust field matching.
 */
export function getFieldName(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
    const labelledByIds = (element.getAttribute('aria-labelledby') || '')
        .split(' ')
        .map((id) => id.trim())
        .filter(Boolean);
    const labelledByTexts = labelledByIds
        .map((id) => document.getElementById(id)?.textContent?.trim() || '')
        .filter(Boolean);

    const hints = unique([
        element.dataset.testid || '',
        element.getAttribute('formcontrolname') || '',
        element.getAttribute('data-testid') || '',
        element.getAttribute('aria-label') || '',
        element.getAttribute('autocomplete') || '',
        element.name || '',
        element.id || '',
        element.placeholder || '',
        element.getAttribute('title') || '',
        ...labelledByTexts
    ]);

    if (element.labels && element.labels.length > 0) {
        Array.from(element.labels).forEach((label) => hints.push(label.innerText.trim()));
    }

    const wrappingLabel = element.closest('label');
    if (wrappingLabel?.innerText) {
        hints.push(wrappingLabel.innerText.trim());
    }

    if (element.id) {
        const explicitLabel = document.querySelector(`label[for="${element.id}"]`);
        if (explicitLabel && explicitLabel instanceof HTMLElement) {
            hints.push(explicitLabel.innerText.trim());
        }
    }

    const fieldWrapper = element.closest('mat-form-field, .form-group, .field, .input-group');
    const nearbyLabel = fieldWrapper?.querySelector('label, mat-label');
    if (nearbyLabel && nearbyLabel instanceof HTMLElement) {
        hints.push(nearbyLabel.innerText.trim());
    }

    return unique(hints).join(' ');
}
