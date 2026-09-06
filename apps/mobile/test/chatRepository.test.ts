import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryChatRepository } from "@inborn/core";
import { IdbChatRepository } from "../src/storage/web/idbRepository";
import { describeChatRepositoryContract } from "./chatRepositoryContract";

/* The same contract against the reference implementation and the browser one. */
describeChatRepositoryContract("InMemoryChatRepository", async ({ now }) => new InMemoryChatRepository({ now }));

let n = 0;
describeChatRepositoryContract("IdbChatRepository", ({ now }) => IdbChatRepository.open({ now, name: `inborn-contract-${n++}`, factory: new IDBFactory() }));
