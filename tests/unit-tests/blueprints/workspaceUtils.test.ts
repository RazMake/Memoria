import { describe, it, expect, vi } from 'vitest';

// Mock workspaceFolders — getWorkspaceRoots() uses it.
const mockWorkspaceFolders: any[] = [];

vi.mock('vscode', () => ({
    workspace: {
        get workspaceFolders() {
            return mockWorkspaceFolders.length === 0 ? null : mockWorkspaceFolders;
        },
    },
}));

import { getWorkspaceRoots, getRootFolderName, classifyFolderKey, classifyFilePath } from '../../../src/blueprints/workspaceUtils';

describe('getWorkspaceRoots', () => {
    it('should return empty array when no workspace folders are open', () => {
        mockWorkspaceFolders.length = 0;
        expect(getWorkspaceRoots()).toEqual([]);
    });

    it('should return URIs of open workspace folders', () => {
        const uriA = { path: '/a' };
        const uriB = { path: '/b' };
        mockWorkspaceFolders.length = 0;
        mockWorkspaceFolders.push({ uri: uriA }, { uri: uriB });
        expect(getWorkspaceRoots()).toEqual([uriA, uriB]);
    });
});

describe('getRootFolderName', () => {
    it('should return the last path segment', () => {
        expect(getRootFolderName({ path: '/a/b/c' })).toBe('c');
    });

    it('should handle trailing slash', () => {
        expect(getRootFolderName({ path: '/a/b/c/' })).toBe('c');
    });

    it('should handle a root with a single segment', () => {
        expect(getRootFolderName({ path: '/single' })).toBe('single');
    });

    it('should handle a path with many segments', () => {
        expect(getRootFolderName({ path: '/Users/jane/projects/my-repo' })).toBe('my-repo');
    });
});

describe('classifyFolderKey', () => {
    const roots = new Set(['ProjectA', 'ProjectB']);

    it('should classify a relative key (no root prefix) correctly', () => {
        const result = classifyFolderKey('00-ToDo/', roots);
        expect(result.isRootSpecific).toBe(false);
        expect(result.relFolder).toBe('00-ToDo/');
    });

    it('should classify a root-specific key correctly', () => {
        const result = classifyFolderKey('ProjectA/00-ToDo/', roots);
        expect(result.isRootSpecific).toBe(true);
        expect(result.relFolder).toBe('00-ToDo/');
        expect(result.rootName).toBe('ProjectA');
    });

    it('should not classify a key as root-specific when the first segment is a root name but there is no remaining path', () => {
        // "ProjectA/" has no path after the prefix — this is just a folder named "ProjectA"
        const result = classifyFolderKey('ProjectA/', roots);
        expect(result.isRootSpecific).toBe(false);
        expect(result.relFolder).toBe('ProjectA/');
    });

    it('should not classify as root-specific when first segment is not a known root', () => {
        const result = classifyFolderKey('SomeFolder/notes/', roots);
        expect(result.isRootSpecific).toBe(false);
        expect(result.relFolder).toBe('SomeFolder/notes/');
    });

    it('should classify a key with a nested relative folder', () => {
        const result = classifyFolderKey('00-Meetings/2024/', roots);
        expect(result.isRootSpecific).toBe(false);
        expect(result.relFolder).toBe('00-Meetings/2024/');
    });

    it('should classify a root-specific key with a nested folder path', () => {
        const result = classifyFolderKey('ProjectB/src/docs/', roots);
        expect(result.isRootSpecific).toBe(true);
        expect(result.relFolder).toBe('src/docs/');
        expect(result.rootName).toBe('ProjectB');
    });
});

describe('classifyFilePath', () => {
    const roots = new Set(['ProjectA', 'ProjectB']);

    it('should classify a bare filename as folder-relative', () => {
        const result = classifyFilePath('Main.todo', roots);
        expect(result.isWorkspaceAbsolute).toBe(false);
        expect(result.relPath).toBe('Main.todo');
    });

    it('should classify a path whose first segment is a root name as workspace-absolute', () => {
        const result = classifyFilePath('ProjectA/00-ToDo/Main.todo', roots);
        expect(result.isWorkspaceAbsolute).toBe(true);
        expect(result.rootName).toBe('ProjectA');
        expect(result.relPath).toBe('00-ToDo/Main.todo');
    });

    it('should classify a path from a second root as workspace-absolute', () => {
        const result = classifyFilePath('ProjectB/notes/Index.md', roots);
        expect(result.isWorkspaceAbsolute).toBe(true);
        expect(result.rootName).toBe('ProjectB');
        expect(result.relPath).toBe('notes/Index.md');
    });

    it('should classify a subfolder path whose first segment is not a root name as folder-relative', () => {
        const result = classifyFilePath('sub/file.md', roots);
        expect(result.isWorkspaceAbsolute).toBe(false);
        expect(result.relPath).toBe('sub/file.md');
    });

    it('should classify a path starting with an unknown first segment as folder-relative', () => {
        const result = classifyFilePath('SomeFolder/notes.md', roots);
        expect(result.isWorkspaceAbsolute).toBe(false);
        expect(result.relPath).toBe('SomeFolder/notes.md');
    });

    it('should return empty rootName for folder-relative paths', () => {
        const result = classifyFilePath('Main.todo', roots);
        expect(result.rootName).toBe('');
    });
});
