import { describe, expect, it } from "bun:test";

import { semaphore } from "../cli/semaphore";

describe("Semaphore", () => {
    it("should allow up to n concurrent operations", async () => {
        const sem = semaphore(3);
        let concurrent = 0;
        let maxConcurrent = 0;

        const task = async (id: number) => {
            const release = await sem();
            try {
                concurrent++;
                maxConcurrent = Math.max(maxConcurrent, concurrent);
                // Simulate work
                await new Promise((resolve) => setTimeout(resolve, 10));
            } finally {
                concurrent--;
                release();
            }
        };

        await Promise.all([task(1), task(2), task(3), task(4), task(5), task(6)]);

        expect(maxConcurrent).toBe(3);
    });

    it("should queue operations beyond the limit", async () => {
        const sem = semaphore(2);
        const completionOrder: number[] = [];

        const task = async (id: number, delay: number) => {
            const release = await sem();
            try {
                await new Promise((resolve) => setTimeout(resolve, delay));
                completionOrder.push(id);
            } finally {
                release();
            }
        };

        // Start tasks - first 2 should run immediately, rest should queue
        await Promise.all([
            task(1, 20), // Completes first
            task(2, 40), // Completes second
            task(3, 10), // Queued, starts after task 1, completes third
            task(4, 10), // Queued, starts after task 3, completes fourth
        ]);

        expect(completionOrder).toHaveLength(4);
        // Task 1 completes first, then task 3 (queued after 1), then task 2, then task 4
        expect(completionOrder[0]).toBe(1);
        expect(completionOrder[2]).toBe(2);
    });

    it("should release slots correctly", async () => {
        const sem = semaphore(1);
        const order: string[] = [];

        const task = async (name: string) => {
            const release = await sem();
            try {
                order.push(`start-${name}`);
                await new Promise((resolve) => setTimeout(resolve, 5));
                order.push(`end-${name}`);
            } finally {
                release();
            }
        };

        await Promise.all([task("a"), task("b"), task("c")]);

        expect(order).toHaveLength(6);
        // With limit of 1, tasks should run sequentially
        expect(order[0]).toBe("start-a");
        expect(order[1]).toBe("end-a");
        expect(order[2]).toBe("start-b");
        expect(order[3]).toBe("end-b");
        expect(order[4]).toBe("start-c");
        expect(order[5]).toBe("end-c");
    });

    it("should handle immediate slot availability", async () => {
        const sem = semaphore(10); // More slots than tasks
        let concurrent = 0;
        let maxConcurrent = 0;

        const task = async () => {
            const release = await sem();
            try {
                concurrent++;
                maxConcurrent = Math.max(maxConcurrent, concurrent);
                await new Promise((resolve) => setTimeout(resolve, 5));
            } finally {
                concurrent--;
                release();
            }
        };

        await Promise.all([task(), task(), task(), task(), task()]);

        // All 5 tasks should run concurrently since we have 10 slots
        expect(maxConcurrent).toBe(5);
    });

    it("should handle errors in tasks without deadlock", async () => {
        const sem = semaphore(2);
        const results: string[] = [];

        const task = async (id: number, shouldFail: boolean) => {
            const release = await sem();
            try {
                if (shouldFail) {
                    throw new Error(`Task ${id} failed`);
                }
                results.push(`success-${id}`);
            } finally {
                release();
            }
        };

        // Run tasks where some fail
        const promises = [task(1, false), task(2, true), task(3, false), task(4, true), task(5, false)];

        await Promise.allSettled(promises);

        // Despite failures, successful tasks should complete
        expect(results).toContain("success-1");
        expect(results).toContain("success-3");
        expect(results).toContain("success-5");
        expect(results).toHaveLength(3);
    });
});
