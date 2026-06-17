import { describe, it, expect } from "vitest";
import { createPeopleFunctions } from "../../../../src/features/snippets/peopleFunctions";
import type { ContactsProvider, MeProfile, ResolvedContact } from "../../../../src/features/snippets/contactsProvider";
import type { TemplateContext } from "../../../../src/features/snippets/templates/templateTypes";

function makeCtx(overrides: Partial<TemplateContext> = {}): TemplateContext {
    return {
        args: [],
        answers: {},
        scope: {},
        now: new Date("2026-01-15"),
        ...overrides,
    };
}

function makeContact(id: string, overrides: Partial<ResolvedContact> = {}): ResolvedContact {
    return {
        kind: "colleague",
        id,
        nickname: id,
        fullName: `${id} Smith`,
        title: "Engineer",
        careerPathKey: "SWE",
        pronounsKey: "they/them",
        levelId: "",
        levelStartDate: "",
        employeeId: "",
        bandRank: "",
        overallRank: "",
        extraFields: {},
        droppedFields: {},
        groupFile: "Team.md",
        groupName: "Team",
        groupType: "report",
        isCustomGroup: false,
        shortTitle: "Eng",
        resolvedPronouns: {
            key: "they/them",
            subject: "they",
            object: "them",
            possessiveAdjective: "their",
            possessive: "theirs",
            reflexive: "themselves",
            extraFields: {},
        },
        resolvedCareerPath: { key: "SWE", name: "SWE", short: "SWE", minimumCareerLevel: 1, extraFields: {} },
        resolvedCareerLevel: null,
        resolvedInterviewType: null,
        ...overrides,
    } as ResolvedContact;
}

function makeProvider(overrides: Partial<ContactsProvider> = {}): ContactsProvider {
    return {
        isAvailable: () => true,
        listGroups: () => ["Team", "Colleagues"],
        getGroupContacts: (groupName) => {
            if (groupName === "Team") {
                return [makeContact("alice"), makeContact("bob")];
            }
            return [];
        },
        getMe: () => ({ FullName: "Alice Manager", TeamName: "Engineering", StartDate: "2024-01-15" } as MeProfile),
        getCareerLevel: () => null,
        getCareerLevelByNumericId: () => null,
        ...overrides,
    };
}

describe("peopleFunctions", () => {
    describe("createPeopleFunctions", () => {
        it("returns three functions: PeopleSelector, Me, DeadlineSelector", () => {
            const fns = createPeopleFunctions(makeProvider());
            const names = fns.map((f) => f.name);
            expect(names).toContain("PeopleSelector");
            expect(names).toContain("Me");
            expect(names).toContain("DeadlineSelector");
        });
    });

    describe("PeopleSelector", () => {
        it("describes single group inputs as one person pick", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            const inputs = ps.describeInputs(ctx) as any[];
            expect(inputs).toHaveLength(1);
            expect(inputs[0].name).toBe("person");
        });

        it("describes union group inputs as group + person picks", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team | Colleagues", options: ["Team", "Colleagues"] }] });
            const inputs = ps.describeInputs(ctx) as any[];
            expect(inputs).toHaveLength(2);
            expect(inputs[0].name).toBe("group");
            expect(inputs[1].name).toBe("person");
        });

        it("resolves to a flattened contact", async () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            const result = await ps.resolve({ person: "alice" }, ctx) as Record<string, unknown>;
            expect(result.id).toBe("alice");
            expect(result.fullName).toBe("alice Smith");
        });

        it("flattens extraFields to top level", async () => {
            const contactWithExtra = makeContact("alice", {
                extraFields: { CustomProp: "custom-value" },
            });
            const provider = makeProvider({
                getGroupContacts: () => [contactWithExtra],
            });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            const result = await ps.resolve({ person: "alice" }, ctx) as Record<string, unknown>;
            expect(result["CustomProp"]).toBe("custom-value");
        });

        it("exposes PascalCase aliases for all known camelCase properties", async () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            const result = await ps.resolve({ person: "alice" }, ctx) as Record<string, unknown>;
            expect(result["FullName"]).toBe("alice Smith");
            expect(result["Id"]).toBe("alice");
            expect(result["Nickname"]).toBe("alice");
            expect(result["Title"]).toBe("Engineer");
            expect(result["CareerPathKey"]).toBe("SWE");
            expect(result["PronounsKey"]).toBe("they/them");
            expect(result["GroupName"]).toBe("Team");
            expect(result["ShortTitle"]).toBe("Eng");
        });

        it("exposes pronouns/Pronouns short aliases for resolvedPronouns object", async () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            const result = await ps.resolve({ person: "alice" }, ctx) as Record<string, unknown>;
            const pronouns = result["pronouns"] as Record<string, unknown>;
            expect(pronouns).toBeDefined();
            expect(pronouns["subject"]).toBe("they");
            expect(pronouns["object"]).toBe("them");
            expect(pronouns["Subject"]).toBe("they");
            expect(pronouns["Object"]).toBe("them");
            expect(pronouns["Key"]).toBe("they/them");
            expect(pronouns["PossessiveAdjective"]).toBe("their");
            expect(pronouns["Possessive"]).toBe("theirs");
            expect(pronouns["Reflexive"]).toBe("themselves");
            expect(result["Pronouns"]).toBe(result["pronouns"]);
        });

        it("exposes level/Level short aliases for resolvedCareerLevel object", async () => {
            const contact = makeContact("alice", { levelId: "l59", resolvedCareerLevel: { key: "l59", id: 59, interviewType: "SWE", titlePattern: "SWE{n}", extraFields: {} } });
            const provider = makeProvider({ getGroupContacts: () => [contact] });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            const result = await ps.resolve({ person: "alice" }, ctx) as Record<string, unknown>;
            const level = result["level"] as Record<string, unknown>;
            expect(level).toBeDefined();
            expect(level["key"]).toBe("l59");
            expect(level["id"]).toBe(59);
            expect(level["Key"]).toBe("l59");
            expect(level["Id"]).toBe(59);
            expect(level["InterviewType"]).toBe("SWE");
            expect(level["TitlePattern"]).toBe("SWE{n}");
            expect(result["Level"]).toBe(result["level"]);
        });

        it("exposes nextLevel / NextLevel resolved object when getCareerLevelByNumericId finds next level", async () => {
            const currentLevel = { key: "l59", id: 59, interviewType: "SWE", titlePattern: "SWE{n}", extraFields: {} };
            const nextLevelObj = { key: "l60", id: 60, interviewType: "SWE", titlePattern: "SWE{n+1}", extraFields: {} };
            const contact = makeContact("alice", { levelId: "l59", resolvedCareerLevel: currentLevel });
            const provider = makeProvider({
                getGroupContacts: () => [contact],
                getCareerLevelByNumericId: (id) => id === 60 ? nextLevelObj : null,
            });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const result = await ps.resolve({ person: "alice" }, makeCtx({ args: [{ value: "Team" }] })) as Record<string, unknown>;
            const nextLevel = result["nextLevel"] as Record<string, unknown>;
            expect(nextLevel).toBeDefined();
            expect(nextLevel["key"]).toBe("l60");
            expect(nextLevel["Key"]).toBe("l60");
            expect(nextLevel["Id"]).toBe(60);
            expect(nextLevel["InterviewType"]).toBe("SWE");
            expect(nextLevel["TitlePattern"]).toBe("SWE{n+1}");
            expect(result["NextLevel"]).toBe(result["nextLevel"]);
        });

        it("nextLevel is null when getCareerLevel returns null (no next level)", async () => {
            const currentLevel = { key: "l99", id: 99, interviewType: "SWE", titlePattern: "SWE{n}", extraFields: {} };
            const contact = makeContact("alice", { levelId: "l99", resolvedCareerLevel: currentLevel });
            const provider = makeProvider({
                getGroupContacts: () => [contact],
                getCareerLevelByNumericId: () => null,
            });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const result = await ps.resolve({ person: "alice" }, makeCtx({ args: [{ value: "Team" }] })) as Record<string, unknown>;
            expect(result["nextLevel"]).toBeNull();
        });

        it("levelId is not exposed as a top-level property on the flat contact", async () => {
            const contact = makeContact("alice", { levelId: "l59" });
            const provider = makeProvider({ getGroupContacts: () => [contact] });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const result = await ps.resolve({ person: "alice" }, makeCtx({ args: [{ value: "Team" }] })) as Record<string, unknown>;
            expect(Object.hasOwn(result, "levelId")).toBe(false);
            expect(Object.hasOwn(result, "LevelId")).toBe(false);
        });

        it("does not override known properties with extraFields values (camelCase and PascalCase)", async () => {
            // 'fullName' and 'FullName' are both in KNOWN_CONTACT_PROPS — extraField should be skipped
            const contactWithShadow = makeContact("alice", {
                extraFields: { fullName: "SHOULD_BE_SKIPPED", FullName: "ALSO_SKIPPED" },
            });
            const provider = makeProvider({
                getGroupContacts: () => [contactWithShadow],
            });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            const result = await ps.resolve({ person: "alice" }, ctx) as Record<string, unknown>;
            // fullName retains original value, not overridden by extraFields
            expect(result.fullName).toBe("alice Smith");
            expect(result["FullName"]).toBe("alice Smith");
        });

        it("skips extraFields key that already exists directly on the contact", async () => {
            // Simulate a contact that has a non-standard direct property AND the same key in extraFields
            const base = makeContact("alice");
            const contactWithDuplicate = Object.assign({ ...base }, {
                myCustomProp: "direct-value",
                extraFields: { myCustomProp: "extra-value" },
            });
            const provider = makeProvider({
                getGroupContacts: () => [contactWithDuplicate as any],
            });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            const result = await ps.resolve({ person: "alice" }, ctx) as Record<string, unknown>;
            // The direct prop value wins, extraFields value is silently skipped
            expect(result["myCustomProp"]).toBe("direct-value");
        });

        it("returns empty inputs when Contacts unavailable", () => {
            const provider = makeProvider({ isAvailable: () => false });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const inputs = ps.describeInputs(makeCtx()) as any[];
            expect(inputs).toHaveLength(0);
        });

        it("throws when Contacts unavailable and resolve is called", () => {
            const provider = makeProvider({ isAvailable: () => false });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            expect(() => ps.resolve({}, makeCtx())).toThrow("Contacts is unavailable");
        });

        it("throws when person not found", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            expect(() => ps.resolve({ person: "nonexistent" }, ctx)).toThrow("not found");
        });

        it("throws when no person selected", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            expect(() => ps.resolve({}, ctx)).toThrow("no person selected");
        });

        it("display() returns fullName", async () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            const result = await ps.resolve({ person: "alice" }, ctx) as any;
            expect(ps.display!(result)).toBe("alice Smith");
        });

        it("dynamic resolveOptions for union group works", async () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team | Colleagues", options: ["Team", "Colleagues"] }] });
            const inputs = ps.describeInputs(ctx) as any[];
            const personInput = inputs[1];
            const ctxWithAnswers: TemplateContext = { ...ctx, answers: { group: "Team" } };
            const options = await personInput.resolveOptions(ctxWithAnswers);
            expect(options.length).toBe(2); // alice and bob
        });

        it("uses quoted first arg as label for single-group input", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Collecting feedback for", isQuoted: true }, { value: "Team" }] });
            const inputs = ps.describeInputs(ctx) as any[];
            expect(inputs).toHaveLength(1);
            expect(inputs[0].name).toBe("person");
            expect(inputs[0].label).toBe("Collecting feedback for");
        });

        it("uses quoted first arg as group label for multi-group input", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({
                args: [
                    { value: "Select candidate", isQuoted: true },
                    { value: "Team | Colleagues", options: ["Team", "Colleagues"] },
                ],
            });
            const inputs = ps.describeInputs(ctx) as any[];
            expect(inputs).toHaveLength(2);
            expect(inputs[0].label).toBe("Select candidate");
        });

        it("resolve: reads group from args[1] when args[0] is quoted label", async () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Pick someone", isQuoted: true }, { value: "Team" }] });
            const result = await ps.resolve({ person: "alice" }, ctx) as any;
            expect(result.id).toBe("alice");
        });
    });

    describe("Me", () => {
        it("describes no inputs", () => {
            const fns = createPeopleFunctions(makeProvider());
            const me = fns.find((f) => f.name === "Me")!;
            const inputs = me.describeInputs(makeCtx()) as any[];
            expect(inputs).toHaveLength(0);
        });

        it("resolves to MeProfile", async () => {
            const fns = createPeopleFunctions(makeProvider());
            const me = fns.find((f) => f.name === "Me")!;
            const result = await me.resolve({}, makeCtx()) as MeProfile;
            expect(result["FullName"]).toBe("Alice Manager");
            expect(result["TeamName"]).toBe("Engineering");
        });

        it("throws when Me.md not found", async () => {
            const provider = makeProvider({ getMe: () => null });
            const fns = createPeopleFunctions(provider);
            const me = fns.find((f) => f.name === "Me")!;
            await expect(me.resolve({}, makeCtx())).rejects.toThrow("Me.md not found");
        });

        it("throws when Contacts unavailable", async () => {
            const provider = makeProvider({ isAvailable: () => false });
            const fns = createPeopleFunctions(provider);
            const me = fns.find((f) => f.name === "Me")!;
            await expect(me.resolve({}, makeCtx())).rejects.toThrow("Contacts is unavailable");
        });

        it("display() returns FullName when available", async () => {
            const fns = createPeopleFunctions(makeProvider());
            const me = fns.find((f) => f.name === "Me")!;
            const result = await me.resolve({}, makeCtx()) as MeProfile;
            expect(me.display!(result)).toBe("Alice Manager");
        });

        it("display() fallback to (me) when no name fields", () => {
            const fns = createPeopleFunctions(makeProvider());
            const me = fns.find((f) => f.name === "Me")!;
            expect(me.display!({})).toBe("(me)");
        });
    });

    describe("DeadlineSelector", () => {
        it("describes inputs as a pick of deadline options from numeric range", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ds = fns.find((f) => f.name === "DeadlineSelector")!;
            const ctx = makeCtx({
                args: [{ value: "1" }, { value: "4" }],
                now: new Date("2026-01-15"),
            });
            const inputs = ds.describeInputs(ctx) as any[];
            expect(inputs).toHaveLength(1);
            expect(inputs[0].kind).toBe("pick");
            expect(inputs[0].options).toHaveLength(3); // days 1, 2, 3 ([1, 4))
        });

        it("resolves to formatDueBy string", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ds = fns.find((f) => f.name === "DeadlineSelector")!;
            const ctx = makeCtx({ now: new Date("2026-01-15") });
            const result = ds.resolve({ choice: "7" }, ctx); // 7 days
            expect(typeof result).toBe("string");
            expect(result as string).toContain("by");
        });

        it("throws when fewer than 2 numeric arguments are provided", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ds = fns.find((f) => f.name === "DeadlineSelector")!;
            const ctx = makeCtx({
                args: [{ value: "5" }],
                now: new Date("2026-01-15"),
            });
            expect(() => ds.describeInputs(ctx)).toThrow(/expected 2 numeric arguments/);
        });

        it("throws when a non-numeric value is passed as start or end", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ds = fns.find((f) => f.name === "DeadlineSelector")!;
            const ctx = makeCtx({
                args: [{ value: "foo" }, { value: "3" }],
                now: new Date("2026-01-15"),
            });
            expect(() => ds.describeInputs(ctx)).toThrow(/invalid start value/);
        });

        it("defaults to 0 days when choice input is undefined", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ds = fns.find((f) => f.name === "DeadlineSelector")!;
            const ctx = makeCtx({ now: new Date("2026-01-15") });
            // Passing empty inputs so inputs["choice"] is undefined → ?? "0" branch
            const result = ds.resolve({}, ctx);
            expect(typeof result).toBe("string");
        });

        it("uses quoted first arg as label", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ds = fns.find((f) => f.name === "DeadlineSelector")!;
            const ctx = makeCtx({
                args: [{ value: "Set deadline", isQuoted: true }, { value: "1" }, { value: "4" }],
                now: new Date("2026-01-15"),
            });
            const inputs = ds.describeInputs(ctx) as any[];
            expect(inputs[0].label).toBe("Set deadline");
            expect(inputs[0].options).toHaveLength(3); // days 1, 2, 3 ([1, 4))
        });

        it("throws when fewer than 2 numeric args are provided after label", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ds = fns.find((f) => f.name === "DeadlineSelector")!;
            const ctx = makeCtx({
                args: [{ value: "Pick date", isQuoted: true }, { value: "5" }],
                now: new Date("2026-01-15"),
            });
            expect(() => ds.describeInputs(ctx)).toThrow(/expected 2 numeric arguments/);
        });
    });

    describe("PeopleSelector with no arg (uses listGroups)", () => {
        it("falls back to contacts.listGroups() when no arg is provided", () => {
            const provider = makeProvider({ listGroups: () => ["Team"] });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            // No args → groups = contacts.listGroups() = ["Team"]
            const inputs = ps.describeInputs(makeCtx({ args: [] })) as any[];
            expect(inputs).toHaveLength(1);
            expect(inputs[0].name).toBe("person");
        });

        it("uses arg.value as single group when arg has no options", () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            // arg with value but no options → [arg.value]
            const inputs = ps.describeInputs(makeCtx({ args: [{ value: "Team" }] })) as any[];
            expect(inputs).toHaveLength(1);
        });

        it("uses empty string for group when groups array is empty", () => {
            const provider = makeProvider({ listGroups: () => [] });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            // No args, empty groups → groupName = "" (groups[0] ?? "")
            const inputs = ps.describeInputs(makeCtx({ args: [] })) as any[];
            // Should still return a person input (for empty group)
            expect(inputs).toHaveLength(1);
        });

        it("uses nickname as label when fullName is null (describeInputs branch)", () => {
            const contactNoName = makeContact("charlie", { fullName: undefined });
            const provider = makeProvider({
                getGroupContacts: () => [contactNoName],
            });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const inputs = ps.describeInputs(makeCtx({ args: [{ value: "Team" }] })) as any[];
            expect(inputs[0].options[0].label).toBe("charlie"); // uses nickname
        });

        it("resolve: uses inputs.group when multiple groups available", async () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team | Colleagues", options: ["Team", "Colleagues"] }] });
            // inputs["group"] is provided → uses it (groups.length > 1 branch)
            const result = await ps.resolve({ group: "Team", person: "alice" }, ctx) as any;
            expect(result.id).toBe("alice");
        });

        it("resolve: falls back to groups[0] when inputs.group is missing for multi-group", async () => {
            const fns = createPeopleFunctions(makeProvider());
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team | Colleagues", options: ["Team", "Colleagues"] }] });
            // No "group" in inputs → falls back to groups[0] via ?? operator
            const result = await ps.resolve({ person: "alice" }, ctx) as any;
            expect(result.id).toBe("alice");
        });

        it("display() falls back to nickname then id when fullName is null", async () => {
            const contactNoName = makeContact("charlie", { fullName: undefined, nickname: "charlie-nick" });
            const provider = makeProvider({ getGroupContacts: () => [contactNoName] });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            const result = await ps.resolve({ person: "charlie" }, ctx) as any;
            // result.fullName is undefined → display() falls through to nickname
            expect(ps.display!(result)).toBe("charlie-nick");
        });

        it("display() falls back to id when both fullName and nickname are null", async () => {
            const contactNoName = makeContact("charlie", { fullName: undefined, nickname: undefined });
            const provider = makeProvider({ getGroupContacts: () => [contactNoName] });
            const fns = createPeopleFunctions(provider);
            const ps = fns.find((f) => f.name === "PeopleSelector")!;
            const ctx = makeCtx({ args: [{ value: "Team" }] });
            const result = await ps.resolve({ person: "charlie" }, ctx) as any;
            // result.fullName and result.nickname are both undefined → display() uses id
            expect(ps.display!(result)).toBe("charlie");
        });
    });
});
