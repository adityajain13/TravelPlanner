// Share-link editors aren't signed in; Worker endpoints that need auth accept their share token instead.
let token: string | undefined;
export const setShareToken = (t?: string) => void (token = t);
export const shareQuery = (): Record<string, string> => (token ? { share: token } : {});
