import { getVsCodeApi, type UITask, type VsCodeApi } from './types';

export const vscode: VsCodeApi = getVsCodeApi();

let _active: UITask[] = [];
let _completed: UITask[] = [];

export function getActive(): UITask[] { return _active; }
export function getCompleted(): UITask[] { return _completed; }

export function setActive(tasks: UITask[]): void { _active = tasks; }
export function setCompleted(tasks: UITask[]): void { _completed = tasks; }
