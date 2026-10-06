export { AuthProvider, useAuth, authTokenKey, authSessionKey } from './AuthProvider';
export type { AuthStatus, AuthSession, AuthContextValue } from './AuthProvider';
export {
  authenticate,
  register,
  validateEmail,
  validatePassword,
  validateFullName,
  displayNameFromEmail,
  firstNameOf,
  MIN_PASSWORD_LENGTH,
} from './authApi';
export type { Credentials, Registration, AuthResult } from './authApi';
