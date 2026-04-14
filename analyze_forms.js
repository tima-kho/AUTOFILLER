const fs = require('fs');

const files = [
    'General-Forms.html',
    'OldEvent-forms.html',
    'application-form.html',
    'prospectus-forms.html'
];

const FIELD_ALIASES = {
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
    subTours: ['subtours', 'subtour'],
    eventDate: ['eventdate'],
    ticketCount: ['ticketcount', 'tickets'],
    totalAttendees: ['totalattendees'],
    attendeeCount: ['attendeecount', 'attendees', 'participantcount'],
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

function normalizeValue(value) {
    return value ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function resolveFieldKey(fieldName) {
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

for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');

    console.log(`\n--- Unmapped fields in ${file} ---`);
    const unmapped = new Set();

    // Simple regex to find input, select, textarea and extract attributes
    const tagRegex = /<(input|select|textarea)[^>]*>/gi;
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
        const tag = match[0];

        const typeMatch = tag.match(/type=["']?([^"'\s>]+)["']?/i);
        const type = typeMatch ? typeMatch[1].toLowerCase() : '';
        if (['hidden', 'submit', 'button', 'image', 'reset', 'checkbox', 'radio'].includes(type)) continue;

        const attributesToExtract = ['name', 'id', 'formcontrolname', 'aria-label', 'placeholder', 'data-testid', 'title'];
        const hints = [];

        attributesToExtract.forEach(attr => {
            const attrRegex = new RegExp(`${attr}=["']([^"']+)["']`, 'i');
            const attrMatch = tag.match(attrRegex);
            if (attrMatch) {
                hints.push(attrMatch[1]);
            }
        });

        const fieldName = hints.join(' ');
        if (!fieldName.trim()) continue; // Skip if no meaningful hints

        const matched = resolveFieldKey(fieldName);
        if (!matched && normalizeValue(fieldName).length > 0) {
            unmapped.add(`${tag} ===> Hints: ${fieldName}`);
        }
    }
    Array.from(unmapped).forEach(u => console.log(u));
}
