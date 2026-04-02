/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UserProfile = {
    id?: string;
    username?: string;
    /**
     * Present when the user has an avatar; relative path e.g. /api/v1/avatars/{username}
     */
    avatar_url?: string;
    /**
     * User role in the system.
     */
    role?: string;
    display_name?: string;
    bio?: string;
    status_text?: string;
    status_emoji?: string;
    banner_url?: string;
    website_url?: string;
    /**
     * Last known activity timestamp; omitted for users who have never logged in.
     */
    last_seen_at?: string;
};

