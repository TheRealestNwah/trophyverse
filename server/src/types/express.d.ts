declare global {
    namespace Express {
        interface User {
            id: string;
            email: string | null;
            username: string;
            created_at: Date;
        }
    }
}

export {};
