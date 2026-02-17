export const Permissions = {
    ADMIN: 1 << 0,
    MANAGE_SERVER: 1 << 1,
    MANAGE_CHANNELS: 1 << 2,
    MANAGE_ROLES: 1 << 3,
    KICK_MEMBERS: 1 << 4,
    BAN_MEMBERS: 1 << 5,
    SEND_MESSAGES: 1 << 6,
    READ_MESSAGES: 1 << 7,
    ATTACH_FILES: 1 << 8,
    MANAGE_MESSAGES: 1 << 9,
    CONNECT_VOICE: 1 << 10,
    SPEAK_VOICE: 1 << 11,
    CREATE_INVITES: 1 << 12,
};
export function hasPermission(userPerms, perm) {
    if (userPerms & Permissions.ADMIN)
        return true;
    return (userPerms & perm) !== 0;
}
