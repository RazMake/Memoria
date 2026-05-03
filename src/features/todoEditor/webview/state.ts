import { getVsCodeApi, type UITask, type ContactTooltipEntry, type VsCodeApi } from './types';

export const vscode: VsCodeApi = getVsCodeApi();

let _active: UITask[] = [];
let _completed: UITask[] = [];
let _contactTooltips: ContactTooltipEntry[] = [];
let _highlightedId: string | null = null;

export function getActive(): UITask[] { return _active; }
export function getCompleted(): UITask[] { return _completed; }
export function getContactTooltips(): ContactTooltipEntry[] { return _contactTooltips; }
export function getHighlightedId(): string | null { return _highlightedId; }

export function setActive(tasks: UITask[]): void { _active = tasks; }
export function setCompleted(tasks: UITask[]): void { _completed = tasks; }
export function setContactTooltips(entries: ContactTooltipEntry[]): void { _contactTooltips = entries; }
export function setHighlightedId(id: string | null): void { _highlightedId = id; }
