import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockShowErrorMessage = vi.fn();

vi.mock('vscode', () => ({
    window: {
        showErrorMessage: (...args: any[]) => mockShowErrorMessage(...args),
    },
}));

import { createSyncTasksCommand } from '../../../src/commands/syncTasks';

describe('createSyncTasksCommand', () => {
    let mockFeature: { syncNow: ReturnType<typeof vi.fn> };
    let mockTelemetry: { logUsage: ReturnType<typeof vi.fn>; logError: ReturnType<typeof vi.fn> };

    const makeHandler = () => createSyncTasksCommand(mockFeature as any, mockTelemetry);

    beforeEach(() => {
        vi.clearAllMocks();
        mockFeature = { syncNow: vi.fn().mockResolvedValue(true) };
        mockTelemetry = { logUsage: vi.fn(), logError: vi.fn() };
    });

    it('should call syncNow on the feature', async () => {
        await makeHandler()();
        expect(mockFeature.syncNow).toHaveBeenCalledOnce();
    });

    it('should log telemetry when sync was started', async () => {
        mockFeature.syncNow.mockResolvedValue(true);
        await makeHandler()();
        expect(mockTelemetry.logUsage).toHaveBeenCalledWith('taskCollector.syncRequested', { trigger: 'command' });
    });

    it('should not log telemetry when sync was not started (feature returned false)', async () => {
        mockFeature.syncNow.mockResolvedValue(false);
        await makeHandler()();
        expect(mockTelemetry.logUsage).not.toHaveBeenCalled();
    });

    it('should log error telemetry and show error message when syncNow throws', async () => {
        const error = new Error('Index corrupted');
        mockFeature.syncNow.mockRejectedValue(error);

        await makeHandler()();

        expect(mockTelemetry.logError).toHaveBeenCalledWith('taskCollector.reconcileFailed', {
            trigger: 'command',
            message: 'Index corrupted',
        });
        expect(mockShowErrorMessage).toHaveBeenCalledWith(
            'Memoria: Task sync failed — Index corrupted'
        );
    });

    it('should handle non-Error thrown values', async () => {
        mockFeature.syncNow.mockRejectedValue('string error');

        await makeHandler()();

        expect(mockTelemetry.logError).toHaveBeenCalledWith('taskCollector.reconcileFailed', {
            trigger: 'command',
            message: 'string error',
        });
    });

    it('should not log usage telemetry when sync throws', async () => {
        mockFeature.syncNow.mockRejectedValue(new Error('fail'));
        await makeHandler()();
        expect(mockTelemetry.logUsage).not.toHaveBeenCalled();
    });
});
