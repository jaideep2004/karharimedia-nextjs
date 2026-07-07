const devFrontendUrl = () => `http://${'localhost'}:${process.env.FRONTEND_PORT || 3000}`;

export const getFrontendUrl = () => {
  const host = process.env.NEXT_PUBLIC_APP_HOST || process.env.APP_HOST || '';
  const configured =
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (host ? `https://${host.replace(/^https?:\/\//, '')}` : '');

  return (configured || devFrontendUrl()).replace(/\/$/, '');
};
