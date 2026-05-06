import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { listDoctorChatSessions } from '../api/doctorChatApi';
import type { DoctorChatListItem } from '../api/doctorChatApi';
import { useAuth } from './AuthContext';

interface DoctorChatContextType {
  chatList: DoctorChatListItem[];
  chatListLoading: boolean;
  selectedChatId: string | null;
  setSelectedChatId: (id: string | null) => void;
  refreshChatList: () => Promise<void>;
}

export const DoctorChatContext = createContext<DoctorChatContextType | undefined>(undefined);
DoctorChatContext.displayName = 'DoctorChatContext';

export function DoctorChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [chatList, setChatList] = useState<DoctorChatListItem[]>([]);
  const [chatListLoading, setChatListLoading] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const refreshChatList = useCallback(async () => {
    if (user?.role !== 'doctor' || !user?.specialty) {
      setChatList([]);
      return;
    }
    setChatListLoading(true);
    try {
      const res = await listDoctorChatSessions();
      setChatList(res.items);
    } catch (err) {
      console.error('Failed to load doctor chat sessions', err);
    } finally {
      setChatListLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === 'doctor') {
      refreshChatList();
      const timer = setInterval(() => {
        void refreshChatList();
      }, 30000);
      return () => clearInterval(timer);
    }
  }, [user, refreshChatList]);

  return (
    <DoctorChatContext.Provider
      value={{
        chatList,
        chatListLoading,
        selectedChatId,
        setSelectedChatId,
        refreshChatList,
      }}
    >
      {children}
    </DoctorChatContext.Provider>
  );
}

export function useDoctorChat() {
  const context = useContext(DoctorChatContext);
  if (context === undefined) {
    throw new Error('useDoctorChat must be used within a DoctorChatProvider');
  }
  return context;
}
