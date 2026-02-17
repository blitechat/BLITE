const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const INVITE_CODE_LENGTH = 8;

/**
 * Generate a random alphanumeric invite code.
 */
export function generateInviteCode(length: number = INVITE_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * CHARSET.length);
    code += CHARSET[randomIndex];
  }
  return code;
}
