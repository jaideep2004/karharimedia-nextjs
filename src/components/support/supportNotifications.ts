type SupportNotificationLike = {
  read?: boolean;
  isRead?: boolean;
  type?: string;
  message?: string;
};

export function countUnreadSupportNotifications(notifications: SupportNotificationLike[]) {
  return notifications.filter((notification) => {
    const unread = !(notification.read ?? notification.isRead);
    const type = notification.type || '';
    const message = notification.message || '';
    return unread && (type.startsWith('support_') || message.toLowerCase().includes('support'));
  }).length;
}
