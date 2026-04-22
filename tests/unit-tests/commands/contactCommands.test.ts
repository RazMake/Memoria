import { beforeEach, describe, expect, it, vi } from "vitest";

const mockShowInformationMessage = vi.fn();
const mockShowErrorMessage = vi.fn();
const mockShowQuickPick = vi.fn();

vi.mock("vscode", () => ({
    window: {
        showInformationMessage: (...args: [string]) => mockShowInformationMessage(...args),
        showErrorMessage: (...args: [string]) => mockShowErrorMessage(...args),
        showQuickPick: (...args: [unknown, unknown]) => mockShowQuickPick(...args),
    },
}));

import {
    createAddPersonCommand,
    createDeletePersonCommand,
    createEditPersonCommand,
    createMovePersonCommand,
} from "../../../src/commands/contactCommands";

describe("contactCommands", () => {
    let mockFeature: {
        isActive: ReturnType<typeof vi.fn>;
        requestAddContactForm: ReturnType<typeof vi.fn>;
        requestEditContactForm: ReturnType<typeof vi.fn>;
        requestMoveContactForm: ReturnType<typeof vi.fn>;
        getAllContacts: ReturnType<typeof vi.fn>;
        getContactById: ReturnType<typeof vi.fn>;
        getGroupSummaries: ReturnType<typeof vi.fn>;
        deleteContact: ReturnType<typeof vi.fn>;
        moveContact: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockFeature = {
            isActive: vi.fn().mockReturnValue(true),
            requestAddContactForm: vi.fn(),
            requestEditContactForm: vi.fn(),
            requestMoveContactForm: vi.fn(),
            getAllContacts: vi.fn().mockReturnValue([]),
            getContactById: vi.fn(),
            getGroupSummaries: vi.fn().mockReturnValue([]),
            deleteContact: vi.fn().mockResolvedValue(undefined),
            moveContact: vi.fn().mockResolvedValue(undefined),
        };
    });

    it("should show an informational message when add is invoked while contacts is inactive", async () => {
        mockFeature.isActive.mockReturnValue(false);

        await createAddPersonCommand(mockFeature as any)();

        expect(mockShowInformationMessage).toHaveBeenCalledWith(
            "Memoria: Contacts is not enabled for this workspace."
        );
        expect(mockFeature.requestAddContactForm).not.toHaveBeenCalled();
    });

    it("should use a QuickPick fallback for edit and request the edit form", async () => {
        const alice = makeResolvedContact({ id: "alias1", fullName: "Alice Anderson" });
        const bob = makeResolvedContact({
            id: "alias2",
            fullName: "Bob Baker",
            title: "Principal Program Manager",
            groupFile: "Partners.md",
            groupName: "Partners",
            careerPathKey: "pm",
        });
        mockFeature.getAllContacts.mockReturnValue([bob, alice]);
        mockFeature.getContactById.mockImplementation((contactId: string) =>
            [alice, bob].find((contact) => contact.id === contactId) ?? null
        );
        mockShowQuickPick.mockResolvedValue({ contactId: "alias1" });

        await createEditPersonCommand(mockFeature as any)();

        const items = mockShowQuickPick.mock.calls[0][0] as Array<{ label: string }>;
        expect(items.map((item) => item.label)).toEqual(["Alice Anderson", "Bob Baker"]);
        expect(mockFeature.requestEditContactForm).toHaveBeenCalledWith("alias1");
    });

    it("should confirm deletions from the command palette before deleting the selected contact", async () => {
        const contact = makeResolvedContact();
        mockFeature.getAllContacts.mockReturnValue([contact]);
        mockFeature.getContactById.mockReturnValue(contact);
        mockShowQuickPick
            .mockResolvedValueOnce({ contactId: "alias1" })
            .mockResolvedValueOnce({ confirm: true });

        await createDeletePersonCommand(mockFeature as any)();

        expect(mockFeature.deleteContact).toHaveBeenCalledWith("alias1");
    });

    it("should toggle directly to the only other group when move is invoked with sidebar context", async () => {
        const contact = makeResolvedContact({
            kind: "report",
            groupFile: "Team.md",
            groupName: "Team",
            groupType: "report",
            resolvedCareerLevel: {
                key: "l5",
                id: 5,
                interviewType: "senior",
                titlePattern: "Senior {CareerPath}",
                extraFields: {},
            },
            resolvedInterviewType: {
                key: "senior",
                name: "Senior",
                extraFields: {},
            },
            levelId: "l5",
            levelStartDate: "2024-11-15",
        });
        mockFeature.getContactById.mockReturnValue(contact);
        mockFeature.getGroupSummaries.mockReturnValue([
            { file: "Team.md", name: "Team", type: "report", isCustom: false, contactCount: 1 },
            { file: "Colleagues.md", name: "Colleagues", type: "colleague", isCustom: false, contactCount: 0 },
        ]);

        await createMovePersonCommand(mockFeature as any)({ contactId: "alias1" });

        expect(mockFeature.moveContact).toHaveBeenCalledWith("alias1", "Colleagues.md");
        expect(mockShowQuickPick).not.toHaveBeenCalled();
    });

    it("should show an informational message when edit is invoked while contacts is inactive", async () => {
        mockFeature.isActive.mockReturnValue(false);

        await createEditPersonCommand(mockFeature as any)();

        expect(mockShowInformationMessage).toHaveBeenCalledWith(
            "Memoria: Contacts is not enabled for this workspace."
        );
        expect(mockFeature.requestEditContactForm).not.toHaveBeenCalled();
    });

    it("should show an informational message when delete is invoked while contacts is inactive", async () => {
        mockFeature.isActive.mockReturnValue(false);

        await createDeletePersonCommand(mockFeature as any)();

        expect(mockShowInformationMessage).toHaveBeenCalledWith(
            "Memoria: Contacts is not enabled for this workspace."
        );
        expect(mockFeature.deleteContact).not.toHaveBeenCalled();
    });

    it("should show an informational message when move is invoked while contacts is inactive", async () => {
        mockFeature.isActive.mockReturnValue(false);

        await createMovePersonCommand(mockFeature as any)();

        expect(mockShowInformationMessage).toHaveBeenCalledWith(
            "Memoria: Contacts is not enabled for this workspace."
        );
        expect(mockFeature.moveContact).not.toHaveBeenCalled();
    });

    it("should do nothing when the user cancels the edit contact QuickPick", async () => {
        mockFeature.getAllContacts.mockReturnValue([makeResolvedContact()]);
        mockShowQuickPick.mockResolvedValue(undefined);

        await createEditPersonCommand(mockFeature as any)();

        expect(mockFeature.requestEditContactForm).not.toHaveBeenCalled();
    });

    it("should do nothing when the user cancels the delete contact QuickPick", async () => {
        mockFeature.getAllContacts.mockReturnValue([makeResolvedContact()]);
        mockShowQuickPick.mockResolvedValue(undefined);

        await createDeletePersonCommand(mockFeature as any)();

        expect(mockFeature.deleteContact).not.toHaveBeenCalled();
    });

    it("should not delete when the user declines the confirmation prompt", async () => {
        const contact = makeResolvedContact();
        mockFeature.getAllContacts.mockReturnValue([contact]);
        mockFeature.getContactById.mockReturnValue(contact);
        mockShowQuickPick
            .mockResolvedValueOnce({ contactId: "alias1" })
            .mockResolvedValueOnce(undefined);

        await createDeletePersonCommand(mockFeature as any)();

        expect(mockFeature.deleteContact).not.toHaveBeenCalled();
    });

    it("should request the move form instead of moving directly when a colleague is sent to a report group", async () => {
        const contact = makeResolvedContact();
        mockFeature.getContactById.mockReturnValue(contact);
        mockFeature.getGroupSummaries.mockReturnValue([
            { file: "Team.md", name: "Team", type: "report", isCustom: false, contactCount: 1 },
            { file: "Colleagues.md", name: "Colleagues", type: "colleague", isCustom: false, contactCount: 0 },
        ]);

        await createMovePersonCommand(mockFeature as any)({ contactId: "alias1" });

        expect(mockFeature.requestMoveContactForm).toHaveBeenCalledWith("alias1", "Team.md");
        expect(mockFeature.moveContact).not.toHaveBeenCalled();
    });
});

function makeResolvedContact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        kind: "colleague",
        id: "alias1",
        nickname: "Alice",
        fullName: "Alice Anderson",
        title: "Senior Software Engineer",
        careerPathKey: "sde",
        pronounsKey: "they/them",
        extraFields: {},
        droppedFields: {},
        groupFile: "Colleagues.md",
        groupName: "Colleagues",
        groupType: "colleague",
        isCustomGroup: false,
        shortTitle: "Senior SDE",
        resolvedPronouns: {
            key: "they/them",
            subject: "they",
            object: "them",
            possessiveAdjective: "their",
            possessive: "theirs",
            reflexive: "themselves",
            extraFields: {},
        },
        resolvedCareerPath: {
            key: "sde",
            name: "Software Engineer",
            short: "SDE",
            minimumCareerLevel: 0,
            extraFields: {},
        },
        resolvedCareerLevel: null,
        resolvedInterviewType: null,
        ...overrides,
    };
}