'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { notificationAPI } from '@/services/api';

// Define types
interface Notification {
  _id: string;
  message: string;
  type: string;
  read?: boolean;
  isRead?: boolean;
  relatedId?: string;
  refModel?: string;
  createdAt: string;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const PUBLIC_AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/admin-login'];

const isPublicAuthPath = (pathname: string) =>
  PUBLIC_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

const hasAuthToken = () =>
  typeof document !== 'undefined' &&
  document.cookie.split('; ').some((row) => row.startsWith('token='));

const canFetchNotifications = () => {
  if (typeof window === 'undefined') return false;
  return !isPublicAuthPath(window.location.pathname) && hasAuthToken();
};

const isUnreadNotification = (notification: Notification) =>
  !(notification.read ?? notification.isRead);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!canFetchNotifications()) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    fetchNotifications();
  }, []);

  // Calculate unread count
  const unreadCount = notifications.filter(n => !(n.read ?? n.isRead)).length;

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!canFetchNotifications()) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const response = await notificationAPI.getNotifications();
      
      if (response.success && response.data) {
        const normalized = Array.isArray(response.data)
          ? response.data.map((notification) => ({
              ...notification,
              read: notification.read ?? notification.isRead ?? false,
            })).filter(isUnreadNotification)
          : [];
        setNotifications(normalized);
      } else {
        setNotifications([]);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  // Mark notification as read
  const markAsRead = async (id: string) => {
    if (!canFetchNotifications()) return;
    
    try {
      await notificationAPI.markAsRead(id);
      setNotifications(prev => prev.filter(n => n._id !== id));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    if (!canFetchNotifications()) return;
    
    try {
      await notificationAPI.markAllAsRead();
      setNotifications([]);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  // Context value
  const contextValue: NotificationsContextType = {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  };

  return (
    <NotificationsContext.Provider value={contextValue}>
      {children}
    </NotificationsContext.Provider>
  );
}

// Custom hook to use the notifications context
export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
};
