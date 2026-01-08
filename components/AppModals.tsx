import React from 'react';
import { Channel, Command, User, UserEntity } from '../types';
import ChannelsModal from './ChannelsModal';
import YamlEditorModal from './YamlEditorModal';
import UserListModal from './UserListModal';
import StaticVariablesEditor from './StaticVariablesEditor';
import ExecutionContextModal from './ExecutionContextModal';

interface AppModalsProps {
    isChannelsModalOpen: boolean;
    setIsChannelsModalOpen: (v: boolean) => void;
    channels: Channel[];
    onAddChannel: (c: Channel) => void;
    onUpdateChannel: (c: Channel) => void;
    onDeleteChannel: (id: string) => void;
    setActiveChannelId: (id: string) => void;
    activeChannelId: string;
    isPaired: boolean;

    isYamlModalOpen: boolean;
    setIsYamlModalOpen: (v: boolean) => void;
    yamlEditCommandId: string | null;
    yamlContent: string;
    handleSaveYaml: (yamlStr: string, parsed: any) => void;
    commands: Command[];

    isUserListModalOpen: boolean;
    setIsUserListModalOpen: (v: boolean) => void;
    users: UserEntity[];
    pointsState: Record<string, number>;
    currencySymbol: string;
    onClearDatabase: () => void;

    isVarsEditorOpen: boolean;
    setIsVarsEditorOpen: (v: boolean) => void;
    selectedCommand: Command | null;
    updateSelectedCommand: (cmd: Command) => void;
    activeChannel: Channel;
    
    executionModalOpen: boolean;
    setExecutionModalOpen: (v: boolean) => void;
    executionTargetNodeId: string | null;
    handleExecuteDebug: (sender: User, args: string[], variables: Record<string, any>) => void;
    executionScope: string[];
    executionDependencies: string[];

    globalClientId: string;
    setGlobalClientId: (id: string) => void;
    geminiApiKey: string;
    setGeminiApiKey: (key: string) => void;

    // Visibility Props
    hiddenChannelIds?: Set<string>;
    toggleHidden?: (id: string, forceHidden?: boolean) => void;
    
    // Reorder Prop
    onReorderChannels?: (fromId: string, toId: string) => void;

    // Auth Prop
    botToken?: string | null;
}

const AppModals: React.FC<AppModalsProps> = ({
    isChannelsModalOpen, setIsChannelsModalOpen, channels, onAddChannel, onUpdateChannel, onDeleteChannel, setActiveChannelId, activeChannelId, isPaired,
    isYamlModalOpen, setIsYamlModalOpen, yamlEditCommandId, yamlContent, handleSaveYaml, commands,
    isUserListModalOpen, setIsUserListModalOpen, users, pointsState, currencySymbol, onClearDatabase,
    isVarsEditorOpen, setIsVarsEditorOpen, selectedCommand, updateSelectedCommand, activeChannel,
    executionModalOpen, setExecutionModalOpen, executionTargetNodeId, handleExecuteDebug, executionScope, executionDependencies,
    globalClientId, setGlobalClientId, geminiApiKey, setGeminiApiKey,
    hiddenChannelIds, toggleHidden, onReorderChannels, botToken
}) => {
    return (
        <>
            {isChannelsModalOpen && (
                <ChannelsModal 
                    isOpen={isChannelsModalOpen} 
                    onClose={() => setIsChannelsModalOpen(false)} 
                    channels={channels} 
                    onAddChannel={onAddChannel} 
                    onUpdateChannel={onUpdateChannel}
                    onDeleteChannel={onDeleteChannel} 
                    onSelectChannel={setActiveChannelId} 
                    activeChannelId={activeChannelId} 
                    isPaired={isPaired} 
                    globalClientId={globalClientId}
                    setGlobalClientId={setGlobalClientId}
                    geminiApiKey={geminiApiKey}
                    setGeminiApiKey={setGeminiApiKey}
                    hiddenChannelIds={hiddenChannelIds}
                    onToggleHidden={toggleHidden}
                    onReorderChannels={onReorderChannels}
                    botToken={botToken}
                />
            )}
            {isYamlModalOpen && yamlEditCommandId && (
                <YamlEditorModal 
                    isOpen={isYamlModalOpen}
                    onClose={() => setIsYamlModalOpen(false)}
                    initialYaml={yamlContent}
                    onSave={handleSaveYaml}
                    title={`Edit: ${commands.find(c => c.id === yamlEditCommandId)?.name || 'Command'}`}
                />
            )}
            {isUserListModalOpen && (
                <UserListModal
                    isOpen={isUserListModalOpen}
                    onClose={() => setIsUserListModalOpen(false)}
                    users={users}
                    points={pointsState}
                    currencySymbol={currencySymbol}
                    onClearDatabase={onClearDatabase}
                />
            )}
            {selectedCommand && isVarsEditorOpen && (
                <StaticVariablesEditor 
                    isOpen={isVarsEditorOpen}
                    onClose={() => setIsVarsEditorOpen(false)}
                    command={selectedCommand}
                    onUpdateCommand={updateSelectedCommand}
                    channel={activeChannel}
                    onUpdateChannel={onUpdateChannel}
                />
            )}
            {executionModalOpen && executionTargetNodeId && (
                <ExecutionContextModal 
                    isOpen={executionModalOpen}
                    nodeId={executionTargetNodeId}
                    onClose={() => setExecutionModalOpen(false)}
                    onRun={handleExecuteDebug}
                    availableVariables={executionScope}
                    requiredVariables={executionDependencies}
                />
            )}
        </>
    );
};

export default AppModals;