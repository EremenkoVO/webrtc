/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export type Room = {
    id?: string;
    name?: string;
    /**
     * Channel type
     */
    type?: 'voice' | 'text';
    created_at?: string;
    roommates?: Array<string>;
};


