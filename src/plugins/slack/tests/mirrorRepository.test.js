/**
 * @jest-environment node
 */

import Database from "better-sqlite3";
import { SqliteMirrorRepository } from "../mirrorRepository.js";

describe("plugins/slack/mirrorRepository", () => {
    it("initialises the tables correctly", () => {
        const SLACK_TOKEN = 'EXAMPLE_TOKEN';
        const repo = new SqliteMirrorRepository(
            new Database(":memory:"),
            SLACK_TOKEN
        );
        const stmt = repo._db.prepare("select * from meta");
        const get = stmt.all();
        expect(get[0].zero).toEqual(0);
        expect(get[0].config).toEqual(`{"version":"slack_mirror_v0"}`);
    });
})
