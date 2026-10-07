export declare function botsLive(workspace: string): Promise<{
    observedAt: string;
    bots: {
        id: unknown;
        role: unknown;
        worker: string;
        host: string;
        pid: unknown;
        issue: unknown;
        mr: unknown;
        run: unknown;
        lastHeartbeat: unknown;
        heartbeatAgeSeconds: number;
        livenessBasis: string;
        active: boolean;
        claims: string[];
    }[];
    claims: {
        stale: boolean;
        resource: string;
        worker: string;
        host: string;
        pid: number;
        ts: string;
        witness: string | null;
    }[];
    cooldown: {
        basis: string;
        configured: number;
        policyLimit: number;
        endsAt: string | null;
    };
}>;
export declare class EventReader {
    private readonly cursor;
    read(p: {
        workspace: string;
        cursor?: string | null;
        limit?: number;
    }): Promise<{
        events: Record<string, unknown>[];
        nextCursor: string | null;
    }>;
}
