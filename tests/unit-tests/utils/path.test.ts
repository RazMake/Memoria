import { describe, expect, it } from 'vitest';
import { normalizePath } from '../../../src/utils/path';

describe('normalizePath', () => {
    it('should return empty string unchanged', () => {
        expect(normalizePath('')).toBe('');
    });

    it('should leave POSIX paths unchanged', () => {
        expect(normalizePath('a/b/c')).toBe('a/b/c');
    });

    it('should convert Windows backslashes to forward slashes', () => {
        expect(normalizePath('a\\b\\c')).toBe('a/b/c');
    });

    it('should convert mixed separators to forward slashes', () => {
        expect(normalizePath('a\\b/c\\d')).toBe('a/b/c/d');
    });

    it('should handle a single backslash', () => {
        expect(normalizePath('a\\b')).toBe('a/b');
    });

    it('should handle a path with no separators', () => {
        expect(normalizePath('filename.md')).toBe('filename.md');
    });

    it('should handle deeply nested Windows path', () => {
        expect(normalizePath('00-ToDo\\subdir\\deep\\file.md')).toBe('00-ToDo/subdir/deep/file.md');
    });
});
