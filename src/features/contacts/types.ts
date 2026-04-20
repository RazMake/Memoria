export type ContactKind = "report" | "colleague";

export interface ContactFieldMap {
    [key: string]: string;
}

export interface ContactTitlePair {
    normal: string;
    short: string;
}

export interface ContactBase {
    kind: ContactKind;
    id: string;
    nickname: string;
    fullName: string;
    title: string;
    careerPathKey: string;
    pronounsKey: string;
    extraFields: ContactFieldMap;
    droppedFields: ContactFieldMap;
}

export interface ReportContact extends ContactBase {
    kind: "report";
    levelId: string;
    levelStartDate: string;
}

export interface ColleagueContact extends ContactBase {
    kind: "colleague";
}

export type Contact = ReportContact | ColleagueContact;

export interface ContactGroupDocument<TContact extends Contact = Contact> {
    kind: ContactKind;
    contacts: TContact[];
}

export interface PronounsReference {
    key: string;
    subject: string;
    object: string;
    possessiveAdjective: string;
    possessive: string;
    reflexive: string;
    extraFields: ContactFieldMap;
}

export interface CareerLevelReference {
    key: string;
    id: number;
    interviewType: string;
    titlePattern: string;
    extraFields: ContactFieldMap;
}

export interface CareerPathReference {
    key: string;
    name: string;
    short: string;
    minimumCareerLevel: number;
    extraFields: ContactFieldMap;
}

export interface InterviewTypeReference {
    key: string;
    name: string;
    extraFields: ContactFieldMap;
}

export interface ContactsReferenceData {
    pronouns: PronounsReference[];
    careerLevels: CareerLevelReference[];
    careerPaths: CareerPathReference[];
    interviewTypes: InterviewTypeReference[];
}

export type ContactIntegrityField = "pronounsKey" | "careerPathKey" | "levelId";

export interface ContactIntegrityCorrection {
    entityType: "contact";
    contactId: string;
    field: ContactIntegrityField;
    oldValue: string;
    newValue: string;
}

export interface CareerLevelIntegrityCorrection {
    entityType: "careerLevel";
    levelKey: string;
    field: "interviewType";
    oldValue: string;
    newValue: string;
}

export interface ContactsViewGroup {
    file: string;
    name: string;
    type: ContactKind;
    isCustom: boolean;
    contactCount: number;
}

export interface ContactsViewContactBase extends ContactBase {
    shortTitle: string;
    groupFile: string;
    groupName: string;
    isCustomGroup: boolean;
}

export interface ContactsViewReportContact extends ContactsViewContactBase {
    kind: "report";
    levelId: string;
    levelStartDate: string;
}

export interface ContactsViewColleagueContact extends ContactsViewContactBase {
    kind: "colleague";
}

export type ContactsViewContact = ContactsViewReportContact | ContactsViewColleagueContact;

export interface ContactsViewReferenceData {
    pronouns: PronounsReference[];
    careerLevels: CareerLevelReference[];
    careerPaths: CareerPathReference[];
    interviewTypes: InterviewTypeReference[];
    canonicalTitles: ContactTitlePair[];
}

export interface ContactsViewSnapshot {
    active: boolean;
    multiGroup: boolean;
    groups: ContactsViewGroup[];
    contacts: ContactsViewContact[];
    referenceData: ContactsViewReferenceData;
}

export interface ContactsViewFormRequest {
    mode: "add" | "edit" | "move";
    contactId?: string;
    targetGroupFile?: string;
    preferredGroupFile?: string;
}

export interface ContactsViewReadyMessage {
    type: "ready";
}

export interface ContactsViewOpenMessage extends ContactsViewFormRequest {
    type: "open";
}

export interface ContactsViewSaveMessage {
    type: "save";
    mode: ContactsViewFormRequest["mode"];
    sourceContactId?: string;
    groupFile?: string;
    newGroupName?: string;
    contact: Contact;
}

export interface ContactsViewDeleteMessage {
    type: "delete";
    contactId: string;
}

export interface ContactsViewMoveMessage {
    type: "move";
    contactId: string;
    targetGroupFile?: string;
}

export type ContactsViewToExtensionMessage =
    | ContactsViewReadyMessage
    | ContactsViewOpenMessage
    | ContactsViewSaveMessage
    | ContactsViewDeleteMessage
    | ContactsViewMoveMessage;

export interface ContactsViewUpdateMessage {
    type: "update";
    snapshot: ContactsViewSnapshot;
}

export interface ContactsViewSavedMessage {
    type: "saved";
    mode: ContactsViewFormRequest["mode"];
    contactId: string;
    groupFile: string;
}

export interface ContactsViewErrorMessage {
    type: "error";
    message: string;
}

export type ContactsViewToWebviewMessage =
    | ContactsViewUpdateMessage
    | { type: "open"; request: ContactsViewFormRequest }
    | ContactsViewSavedMessage
    | ContactsViewErrorMessage;