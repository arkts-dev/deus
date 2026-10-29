export declare function botsLive(workspace: string): Promise<{
    observedAt: string;
    runs: {
        heartbeatAgeSeconds: number;
        livenessBasis: string;
        active: boolean;
        id: string;
        role: string;
        status: string;
        host: string | null;
        pid: number | null;
        issue: string | null;
        lastHeartbeat: string;
    }[];
    reservations: string;
    throttling: string;
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
