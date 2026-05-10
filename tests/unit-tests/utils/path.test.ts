import { describe, expect, it } from 'vitest';
import { normalizePath, slugifyFilename, ensureMdExtension } from '../../../src/utils/path';

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

describe('slugifyFilename', () => {
    it('should slugify a normal title when given spaces', () => {
        expect(slugifyFilename('My Task Name')).toBe('my-task-name');
    });

    it('should slugify two words when given a simple phrase', () => {
        expect(slugifyFilename('Hello World')).toBe('hello-world');
    });

    it('should return unchanged when already slugged', () => {
        expect(slugifyFilename('already-slugged')).toBe('already-slugged');
    });

    it('should lowercase when given upper case input', () => {
        expect(slugifyFilename('UPPER CASE')).toBe('upper-case');
    });

    it('should collapse multiple spaces when given extra whitespace', () => {
        expect(slugifyFilename('spaces   and   tabs')).toBe('spaces-and-tabs');
    });

    it('should preserve dots when given a filename with extension', () => {
        expect(slugifyFilename('file.txt')).toBe('file.txt');
    });

    it('should convert underscores to hyphens when given underscored text', () => {
        expect(slugifyFilename('my_task_name')).toBe('my-task-name');
    });

    it('should return empty string when all special chars', () => {
        expect(slugifyFilename('!!!')).toBe('');
    });

    it('should return empty string when given empty input', () => {
        expect(slugifyFilename('')).toBe('');
    });

    it('should return empty string when all hyphens after trim', () => {
        expect(slugifyFilename('---')).toBe('');
    });

    it('should collapse multiple hyphens when given consecutive hyphens', () => {
        expect(slugifyFilename('hello---world')).toBe('hello-world');
    });

    it('should trim leading and trailing spaces when given padded input', () => {
        expect(slugifyFilename(' leading trailing ')).toBe('leading-trailing');
    });

    it('should strip non-ASCII characters when given accented text', () => {
        expect(slugifyFilename('café')).toBe('caf');
    });
});

describe('ensureMdExtension', () => {
    it('should append .md when filename has no dot', () => {
        expect(ensureMdExtension('my-task')).toBe('my-task.md');
    });

    it('should return unchanged when filename has an extension', () => {
        expect(ensureMdExtension('notes.txt')).toBe('notes.txt');
    });

    it('should append .md when given a plain name', () => {
        expect(ensureMdExtension('readme')).toBe('readme.md');
    });

    it('should return unchanged when given a dotfile', () => {
        expect(ensureMdExtension('.gitignore')).toBe('.gitignore');
    });

    it('should return unchanged when filename has multiple dots', () => {
        expect(ensureMdExtension('file.name.ext')).toBe('file.name.ext');
    });

    it('should append .md when given empty string', () => {
        expect(ensureMdExtension('')).toBe('.md');
    });
});
