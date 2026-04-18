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

import { getWorkspaceRoots, getRootFolderName, classifyFolderKey } from '../../../src/blueprints/workspaceUtils';

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
