
// server/services/ProcessManager.js

export class ProcessManager {
    static instance = null;

    constructor() {
        if (ProcessManager.instance) return ProcessManager.instance;
        ProcessManager.instance = this;
        
        // Active processes: executionId -> ProcessData
        this.activeExecutions = new Map();
        
        // History: channelId -> Array<HistoryItem> (Max 100)
        this.history = new Map();
        
        this.socketBroadcaster = null;
    }

    setBroadcaster(fn) {
        this.socketBroadcaster = fn;
    }

    // Called when a flow starts
    startExecution(executionId, command, user, channelId) {
        const processData = {
            executionId,
            commandId: command.id,
            commandName: command.name,
            channelId,
            startedAt: Date.now(),
            currentNodeId: command.rootAction.id,
            waitingData: null,
            user: {
                displayName: user.displayName,
                username: user.username
            },
            source: 'server'
        };

        this.activeExecutions.set(executionId, processData);
        this.broadcast(channelId, 'PROCESS_UPDATE', { type: 'add', process: processData });
    }

    // Called when moving between nodes
    updateNode(executionId, nodeId, channelId) {
        const proc = this.activeExecutions.get(executionId);
        if (proc) {
            proc.currentNodeId = nodeId;
            // Clear waiting data on move, it will be set again if next node waits
            proc.waitingData = null; 
            // We optimize bandwidth by NOT broadcasting every node move unless critical debugging is on.
            // But for accurate "current node" display, we should.
            this.broadcast(channelId, 'PROCESS_UPDATE', { type: 'update', executionId, updates: { currentNodeId: nodeId, waitingData: null } });
        }
    }

    // Called when flow enters a wait state (Timer or Keyword)
    setWaiting(executionId, waitingData, channelId) {
        const proc = this.activeExecutions.get(executionId);
        if (proc) {
            // Merge existing data to keep start times if updated
            proc.waitingData = { ...waitingData };
            // Ensure waiting data includes critical fields for client timers
            if (!proc.waitingData.startTime) proc.waitingData.startTime = Date.now();
            
            this.activeExecutions.set(executionId, proc);
            this.broadcast(channelId, 'PROCESS_UPDATE', { type: 'update', executionId, updates: { waitingData: proc.waitingData } });
        }
    }

    // Called when flow ends
    endExecution(executionId, status, error = null) {
        const proc = this.activeExecutions.get(executionId);
        if (proc) {
            const endedAt = Date.now();
            const historyItem = {
                executionId: proc.executionId,
                commandId: proc.commandId,
                commandName: proc.commandName,
                channelId: proc.channelId,
                startedAt: proc.startedAt,
                endedAt: endedAt,
                durationMs: endedAt - proc.startedAt,
                status: status, // 'completed', 'error', 'halted'
                error: error,
                user: proc.user
            };

            // Add to history
            if (!this.history.has(proc.channelId)) {
                this.history.set(proc.channelId, []);
            }
            const chanHistory = this.history.get(proc.channelId);
            chanHistory.unshift(historyItem);
            
            // Limit to 100
            if (chanHistory.length > 100) {
                chanHistory.pop();
            }

            this.activeExecutions.delete(executionId);
            
            // Broadcast Removal from Active AND Add to History
            this.broadcast(proc.channelId, 'PROCESS_UPDATE', { type: 'remove', executionId });
            this.broadcast(proc.channelId, 'HISTORY_UPDATE', { item: historyItem });
        }
    }

    getSnapshot(channelId) {
        const active = [];
        for (const [_, proc] of this.activeExecutions) {
            if (proc.channelId === channelId) active.push(proc);
        }
        
        return {
            active,
            history: this.history.get(channelId) || []
        };
    }

    broadcast(channelId, type, payload) {
        if (this.socketBroadcaster) {
            this.socketBroadcaster(channelId, { type, payload });
        }
    }
}
