


import React, { Suspense } from 'react';
import ConfirmationModal, { DialogType } from '../ConfirmationModal';
import AppModals from '../AppModals';
import EditorManagerModal from '../EditorManagerModal';
import LoginModal from '../LoginModal';
import AppGuideModal from '../AppGuideModal';
import { UserEntity } from '../../types';

// Dynamic Loading Helper
const ComponentLoader = ({ children }: { children?: React.ReactNode }) => (
  <Suspense fallback={null}>
    {children}
  </Suspense>
);

interface GlobalModalsProps {
  // Confirmation Dialog
  dialogConfig: { 
    isOpen: boolean; 
    type: DialogType; 
    title: string; 
    message: string; 
    confirmLabel?: string; 
    isAlert?: boolean; 
    onConfirm?: () => void;
    onCancel?: () => void;
  };
  setDialogConfig: React.Dispatch<React.SetStateAction<any>>;
  dialogResolver: React.MutableRefObject<((value: boolean) => void) | null>;

  // App Modals Bundle (Channels, YAML, UserList, Vars, Exec)
  modalProps: any; // Using the existing aggregate prop from App.tsx

  // Editor Manager
  isEditorManagerOpen: boolean;
  setIsEditorManagerOpen: (v: boolean) => void;
  editorList: UserEntity[];
  onAddEditor: (user: UserEntity) => void;
  onRemoveEditor: (uid: string) => void;
  onSearchUsers: (q: string) => void;
  userSearchResults: UserEntity[];

  // Login
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (v: boolean) => void;
  loginAuthUrl: string;
  loginAuthMode: 'server' | 'client';
  loginModalTitle?: string; // New
  onReadOnly: () => void;

  // Guide
  isAppGuideOpen: boolean;
  setIsAppGuideOpen: (v: boolean) => void;
}

const GlobalModals: React.FC<GlobalModalsProps> = (props) => {
  const { 
      dialogConfig, setDialogConfig, dialogResolver,
      modalProps,
      isEditorManagerOpen, setIsEditorManagerOpen, editorList, onAddEditor, onRemoveEditor, onSearchUsers, userSearchResults,
      isLoginModalOpen, setIsLoginModalOpen, loginAuthUrl, loginAuthMode, loginModalTitle, onReadOnly,
      isAppGuideOpen, setIsAppGuideOpen
  } = props;

  return (
    <>
      <ConfirmationModal 
        isOpen={dialogConfig.isOpen} 
        type={dialogConfig.type} 
        title={dialogConfig.title} 
        message={dialogConfig.message} 
        confirmLabel={dialogConfig.confirmLabel} 
        onConfirm={() => { 
            setDialogConfig(prev => ({ ...prev, isOpen: false })); 
            if (dialogConfig.onConfirm) dialogConfig.onConfirm();
            dialogResolver.current?.(true); 
        }} 
        onCancel={() => { 
            setDialogConfig(prev => ({ ...prev, isOpen: false })); 
            if (dialogConfig.onCancel) dialogConfig.onCancel();
            dialogResolver.current?.(false); 
        }} 
        isAlert={dialogConfig.isAlert} 
      />
      
      <ComponentLoader>
        <AppModals {...modalProps} />
      </ComponentLoader>
      
      {/* Editor Manager Modal */}
      {isEditorManagerOpen && (
          <EditorManagerModal 
              isOpen={isEditorManagerOpen}
              onClose={() => setIsEditorManagerOpen(false)}
              editors={editorList}
              onAddEditor={onAddEditor}
              onRemoveEditor={onRemoveEditor}
              onSearchUsers={onSearchUsers}
              searchResults={userSearchResults}
          />
      )}

      {/* Login Modal */}
      {isLoginModalOpen && (
          <LoginModal 
              isOpen={isLoginModalOpen}
              onClose={() => setIsLoginModalOpen(false)}
              authUrl={loginAuthUrl}
              mode={loginAuthMode}
              onReadOnly={onReadOnly}
              title={loginModalTitle}
          />
      )}

      {/* App Guide Modal */}
      {isAppGuideOpen && (
          <AppGuideModal 
              isOpen={isAppGuideOpen}
              onClose={() => setIsAppGuideOpen(false)}
          />
      )}
    </>
  );
};

export default GlobalModals;