import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { isNftTokenId, NftQueryError, parseNftGalleryQuery } from "../lib/nfts/model.ts";
import { AFFILIATE_NFT_CANDIDATES_QUERY } from "../lib/affiliates/eligibility-queries.ts";
import { INDEXED_NFT_QUERY, NFT_GALLERY_QUERY } from "../lib/nfts/queries.ts";

const wallet = `0x${"a".repeat(40)}`;
const other = `0x${"b".repeat(40)}`;
const recipient = `0x${"c".repeat(40)}`;
const zero = `0x${"0".repeat(40)}`;
const factory = `0x${"d".repeat(40)}`;
const v6Factory = `0x${"f".repeat(40)}`;
const pins = [{ chain_id: 11155111, factory, contract_version: "affiliate-v5" }, { chain_id: 1, factory, contract_version: "affiliate-v5" }, { chain_id: 11155111, factory: v6Factory, contract_version: "affiliate-v6" }];
const hash = (value: number) => `0x${value.toString(16).padStart(64, "0")}`;
const collection = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

test("NFT gallery validates and bounds all public query inputs", () => {
  assert.deepEqual(parseNftGalleryQuery(new URLSearchParams({ wallet: wallet.toUpperCase().replace("0X", "0x") })), {
    wallet, view: "minted", status: "all", page: 1, pageSize: 12,
  });
  for (const suffix of ["", "&view=anything", "&status=anything", "&page=0", "&page=01", "&page=1.5", "&page=10001", "&pageSize=100000", "&wallet=" + other, "&extra=1"]) {
    const query = suffix === "" ? new URLSearchParams() : new URLSearchParams(`wallet=${wallet}${suffix}`);
    assert.throws(() => parseNftGalleryQuery(query), NftQueryError);
  }
  for (const invalid of [zero, "0x123", "' OR 1=1", " " + wallet]) {
    assert.throws(() => parseNftGalleryQuery(new URLSearchParams({ wallet: invalid })), NftQueryError);
  }
  assert.equal(parseNftGalleryQuery(new URLSearchParams({ wallet, view: "held", status: "refundable", page: "10000", pageSize: "12" })).page, 10000);
  for (const id of ["1", "20", "65536"]) assert.ok(isNftTokenId(id));
  for (const id of ["0", "01", "65537", "1.0", "-1", "1;DROP"]) assert.equal(isNftTokenId(id), false);
});

test("canonical SQL portfolio preserves mint provenance, transfers, burns, phases, isolation and pagination", {
  skip: process.env.TEST_NFT_DATABASE !== "1" ? "Set TEST_NFT_DATABASE=1 and a local TEST_NFT_DATABASE_URL." : false,
}, async () => {
  const connectionString = process.env.TEST_NFT_DATABASE_URL;
  assert.ok(connectionString);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname));
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    // These connection-local tables shadow the real schema. No persistent rows or
    // schema changes are made; the final rollback removes every fixture.
    await client.query(`
      CREATE TEMP TABLE manekineko_networks(chain_id bigint, name text) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_collections(id uuid, chain_id bigint, name text, symbol text, round_id numeric,
        max_supply integer, contract_version text, algorithm_version text) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_deployments(collection_id uuid, chain_id bigint, contract_address text,
        factory_address text, status text) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_collection_state(collection_id uuid, phase text, block_number bigint, block_hash text,
        synced_at timestamptz, total_minted integer, winning_token_id integer, prize_paid boolean, prize_recipient text) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_indexer_checkpoints(collection_id uuid, block_number bigint, block_hash text, trust_fingerprint text) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_collection_awards(collection_id uuid,rank integer,token_id integer,amount_wei numeric,
        claimed boolean,winning_holder text,recipient text,block_number bigint,block_hash text) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_history_winners(collection_id uuid, winning_holder text) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_chain_events(collection_id uuid, block_number bigint, transaction_index integer,
        log_index integer, event_name text, arguments jsonb, block_timestamp timestamptz, transaction_hash text) ON COMMIT DROP;
    `);
    await client.query("INSERT INTO manekineko_networks VALUES (11155111, 'Sepolia'), (1, 'Ethereum')");
    async function addCollection(id: number, phase = "minting", chain = 11155111, approved = true) {
      const cid = collection(id);
      await client.query("INSERT INTO manekineko_collections VALUES($1,$2,$3,'NFT',$4,20,'affiliate-v5','unique-rank-v2')", [cid, chain, `Collection ${id}`, id]);
      await client.query("INSERT INTO manekineko_deployments VALUES($1,$2,$3,$4,'deployed')", [cid, chain, `0x${id.toString(16).padStart(40, "0")}`, approved ? factory : other]);
      await client.query("INSERT INTO manekineko_collection_state VALUES($1,$2,100,$3,'2026-09-18T00:00:00Z',20,$4,$5,$6)", [cid, phase, hash(100), phase === "complete" ? 1 : null, phase === "complete", phase === "complete" ? wallet : null]);
      await client.query("INSERT INTO manekineko_indexer_checkpoints VALUES($1,100,$2,$3)", [cid, hash(100), "f".repeat(64)]);
    }
    let log = 0;
    async function event(id: number, name: string, args: object, block = 50, transaction = 0) {
      log += 1;
      await client.query("INSERT INTO manekineko_chain_events VALUES($1,$2,$3,$4,$5,$6,'2026-09-17T00:00:00Z',$7)", [collection(id), block, transaction, log, name, JSON.stringify(args), hash(log)]);
    }
    async function mint(id: number, first: number, count: number, payer = wallet, to = wallet) {
      for (let token = first; token < first + count; token += 1) await event(id, "Transfer", { from: zero, to, tokenId: String(token) });
      await event(id, "Minted", { payer, recipient: to, firstTokenId: String(first), quantity: String(count) });
    }
    async function gallery(view = "minted", status = "all", page = 1, address = wallet, chain = 11155111) {
      return (await client.query(NFT_GALLERY_QUERY, [chain, JSON.stringify(pins), address, view, status, 12, (page - 1) * 12])).rows[0];
    }
    await addCollection(1);
    await addCollection(2, "complete");
    await addCollection(3, "refundable");
    await addCollection(4, "minting", 1);
    await addCollection(5, "minting", 11155111, false);
    await mint(1, 1, 3);
    await mint(1, 4, 2, wallet, recipient); // paid by wallet, gifted to another address
    await mint(1, 6, 1, other, wallet); // third-party payment, wallet was mint recipient
    await mint(1, 7, 1, other, other);
    await event(1, "Transfer", { from: other, to: wallet, tokenId: "7" }, 60);
    await event(1, "Transfer", { from: wallet, to: other, tokenId: "2" }, 60);
    await event(1, "Transfer", { from: wallet, to: zero, tokenId: "3" }, 60);
    await event(1, "Refunded", { holder: wallet, recipient: wallet, tokenId: "3", amount: "100" }, 60);
    await event(1, "Transfer", { from: wallet, to: other, tokenId: "1" }, 101); // beyond confirmed state
    await mint(2, 1, 8);
    await client.query("INSERT INTO manekineko_history_winners VALUES($1,$2)", [collection(2), wallet]);
    await mint(3, 1, 1);
    await mint(4, 1, 1);
    await mint(5, 1, 1);

    const all = await gallery();
    assert.equal(all.total, 15);
    assert.equal(all.minted, 15);
    assert.equal(all.held, 12);
    assert.equal(all.ongoing, 6);
    assert.equal(all.completed, 8);
    assert.equal(all.items.length, 12);
    assert.equal((await gallery("minted", "all", 2)).items.length, 3);
    assert.equal((await gallery("minted", "all", 3)).total, 15);
    assert.deepEqual((await gallery("minted", "all", 3)).items, []);
    assert.equal((await gallery("held")).total, 12);
    assert.equal((await gallery("minted", "refundable")).total, 1);
    assert.equal((await gallery("minted", "completed")).total, 8);
    assert.equal((await gallery("held", "ongoing")).total, 3);
    assert.equal((await gallery("minted", "all", 1, recipient)).total, 2);
    assert.equal((await gallery("minted", "all", 1, wallet, 1)).total, 1);
    assert.equal((await gallery("minted", "all", 1, `0x${"e".repeat(40)}`)).total, 0);

    const token = async (id: number, tokenId: number) => (await client.query(INDEXED_NFT_QUERY, [11155111, JSON.stringify(pins), collection(id), tokenId])).rows[0];
    assert.equal((await token(1, 1)).currentOwner, wallet, "a post-checkpoint transfer must not change confirmed ownership");
    assert.equal((await token(1, 2)).currentOwner, other);
    assert.equal((await token(1, 3)).currentOwner, null);
    assert.equal((await token(1, 3)).refunded, true);
    assert.equal((await token(1, 4)).mintedBy, wallet);
    assert.equal((await token(1, 4)).mintedTo, recipient);
    assert.equal((await token(1, 6)).mintedBy, other);
    assert.equal((await token(1, 6)).mintedTo, wallet);
    assert.equal((await token(2, 1)).winningToken, true);
    assert.equal((await token(2, 1)).winningHolder, wallet);
    assert.equal((await token(2, 1)).revealed, true);
    assert.equal((await token(1, 1)).revealed, false);
    assert.equal(await token(5, 1), undefined);
    assert.equal(await token(1, 8), undefined);
    // Same-block transfers must use the last log, even in a later transaction.
    await event(1, "Transfer", { from: wallet, to: recipient, tokenId: "1" }, 99, 1);
    await event(1, "Transfer", { from: recipient, to: wallet, tokenId: "1" }, 99, 2);
    assert.equal((await token(1, 1)).currentOwner, wallet);

    // A quarantined checkpoint or mismatched same-height hash cannot leak orphan ownership.
    await client.query("UPDATE manekineko_indexer_checkpoints SET block_hash=$2 WHERE collection_id=$1", [collection(1), hash(99)]);
    assert.equal(await token(1, 1), undefined);
    assert.equal((await gallery()).total, 9);
    await client.query("UPDATE manekineko_indexer_checkpoints SET block_hash=$2,trust_fingerprint=NULL WHERE collection_id=$1", [collection(1), hash(100)]);
    assert.equal(await token(1, 1), undefined);
    // Reorg rebuild deletes orphan events. No independent ownership cache survives it.
    await client.query("UPDATE manekineko_indexer_checkpoints SET trust_fingerprint=$2 WHERE collection_id=$1", [collection(1), "f".repeat(64)]);
    await client.query("DELETE FROM manekineko_chain_events WHERE collection_id=$1", [collection(1)]);
    assert.equal(await token(1, 1), undefined);
    assert.equal((await gallery()).total, 9);
    // A V6 factory pin is independent of V5, including when version fields are tampered with.
    await addCollection(6);
    await client.query("UPDATE manekineko_collections SET contract_version='affiliate-v6',algorithm_version='unique-rank-v3' WHERE id=$1", [collection(6)]);
    await client.query("UPDATE manekineko_deployments SET factory_address=$2 WHERE collection_id=$1", [collection(6), v6Factory]);
    await mint(6, 1, 1);
    assert.equal((await token(6, 1)).contractVersion, "affiliate-v6");
    assert.equal((await token(6, 1)).algorithmVersion, "unique-rank-v3");
    assert.equal((await gallery()).total, 10);
    await client.query("UPDATE manekineko_deployments SET factory_address=$2 WHERE collection_id=$1", [collection(6), factory]);
    assert.equal(await token(6, 1), undefined, "a V5 factory pin cannot authorize V6");
    await client.query("UPDATE manekineko_deployments SET factory_address=$2 WHERE collection_id=$1", [collection(6), v6Factory]);
    await client.query("UPDATE manekineko_collections SET algorithm_version='unique-rank-v2' WHERE id=$1", [collection(6)]);
    assert.equal(await token(6, 1), undefined, "a mismatched V6 algorithm must remain hidden");
    await client.query("UPDATE manekineko_collections SET contract_version='affiliate-v5' WHERE id=$1", [collection(6)]);
    assert.equal(await token(6, 1), undefined, "a V6 factory pin cannot authorize V5");
    // Holder eligibility discovery accepts historical factories as candidates;
    // the separate canonical gate check, never the database, authorizes them.
    await addCollection(7,"complete",11155111,false);
    await client.query("UPDATE manekineko_collections SET contract_version='affiliate-v6',algorithm_version='unique-rank-v3' WHERE id=$1",[collection(7)]);
    await mint(7,1,14);
    await event(7,"Transfer",{from:wallet,to:other,tokenId:"2"},80);
    await event(7,"Transfer",{from:wallet,to:zero,tokenId:"3"},80);
    await event(7,"Transfer",{from:wallet,to:other,tokenId:"4"},101);
    await addCollection(8,"complete");await mint(8,1,1);
    await addCollection(9,"complete",1);await mint(9,1,1);
    const candidates=async(offset=0)=>(await client.query(AFFILIATE_NFT_CANDIDATES_QUERY,[11155111,collection(8),wallet,offset])).rows[0];
    const first=await candidates();
    assert.equal(first.total,20,"eight prior V5 and twelve held older-factory V6 NFTs are candidates");
    assert.equal(first.items.length,12);
    assert.deepEqual(first.items.slice(0,8).map((item:{sourceTokenId:string})=>item.sourceTokenId),["1","2","3","4","5","6","7","8"]);
    assert.equal(first.items[8].collectionId,collection(7));
    assert.deepEqual(first.items.slice(8).map((item:{sourceTokenId:string})=>item.sourceTokenId),["1","4","5","6"]);
    assert.equal((await candidates(12)).items.length,8);
    assert.deepEqual((await candidates(24)).items,[]);
    assert.ok(first.items.every((item:{collectionId:string})=>![collection(8),collection(9)].includes(item.collectionId)),"current target and wrong chain are excluded");
    await client.query("UPDATE manekineko_indexer_checkpoints SET trust_fingerprint=NULL WHERE collection_id=$1",[collection(7)]);
    assert.equal((await candidates()).total,8,"quarantined candidates disappear");
    await client.query("UPDATE manekineko_collection_state SET prize_paid=false WHERE collection_id=$1",[collection(2)]);
    assert.equal((await candidates()).total,0,"an unpaid source cannot qualify");
    // Every V8 award has its own canonical claim state, including the sixth rank.
    const v8Factory=`0x${"8".repeat(40)}`;
    pins.push({chain_id:11155111,factory:v8Factory,contract_version:"affiliate-v8"});
    await addCollection(10,"awaiting_prize");await mint(10,1,7);
    await client.query("UPDATE manekineko_collections SET contract_version='affiliate-v8',algorithm_version='unique-rank-v5' WHERE id=$1",[collection(10)]);
    await client.query("UPDATE manekineko_deployments SET factory_address=$2 WHERE collection_id=$1",[collection(10),v8Factory]);
    await client.query("UPDATE manekineko_collection_state SET winning_token_id=1 WHERE collection_id=$1",[collection(10)]);
    for(let rank=1;rank<=6;rank++)await client.query("INSERT INTO manekineko_collection_awards VALUES($1,$2,$2,1000000000000000000,$3,$4,$4,100,$5)",[collection(10),rank,rank===6,rank===6?wallet:null,hash(100)]);
    const sixth=await token(10,6);assert.equal(sixth.awardRank,6);assert.equal(sixth.prizePaid,true);assert.equal(sixth.winningToken,true);
    assert.equal((await token(10,5)).prizePaid,false);assert.equal((await token(10,7)).winningToken,false);
    assert.equal((await candidates()).total,7,"revealed V8 holdings qualify before every prize has been claimed");
    await client.query("UPDATE manekineko_collection_awards SET block_hash=$2 WHERE collection_id=$1",[collection(10),hash(99)]);
    assert.equal((await token(10,6)).awardRank,null,"orphan award rows never become claimable");
    await client.query("UPDATE manekineko_deployments SET factory_address=$2 WHERE collection_id=$1",[collection(10),v6Factory]);
    assert.equal(await token(10,6),undefined,"a V6 factory pin cannot authorize V8");
    // V10 tokens exist and are discoverable before draw, under their own exact pin.
    const v10Factory=`0x${"9".repeat(40)}`;
    pins.push({chain_id:11155111,factory:v10Factory,contract_version:"affiliate-v10"});
    await addCollection(11,"minting");await mint(11,1,2);
    await client.query("UPDATE manekineko_collections SET contract_version='affiliate-v10',algorithm_version='unique-rank-v6' WHERE id=$1",[collection(11)]);
    await client.query("UPDATE manekineko_deployments SET factory_address=$2 WHERE collection_id=$1",[collection(11),v10Factory]);
    const pending=await token(11,1);assert.equal(pending.contractVersion,"affiliate-v10");assert.equal(pending.revealed,false);assert.equal(pending.winningToken,false);
    await client.query("UPDATE manekineko_collection_state SET phase='awaiting_prize',winning_token_id=2 WHERE collection_id=$1",[collection(11)]);
    await client.query("INSERT INTO manekineko_collection_awards VALUES($1,6,1,1000000000000000000,true,$2,$2,100,$3)",[collection(11),wallet,hash(100)]);
    assert.equal((await token(11,1)).prizePaid,true);assert.equal((await token(11,1)).revealed,true);
    assert.equal((await token(11,1)).awardRank,6);
    assert.ok((await candidates()).items.some((item:{collectionId:string})=>item.collectionId===collection(11)));
    await client.query("UPDATE manekineko_collections SET algorithm_version='unique-rank-v5' WHERE id=$1",[collection(11)]);
    assert.equal(await token(11,1),undefined,"V10 never reuses the V9 algorithm marker");
    await client.query("UPDATE manekineko_collections SET algorithm_version='unique-rank-v6' WHERE id=$1",[collection(11)]);
    await client.query("UPDATE manekineko_deployments SET factory_address=$2 WHERE collection_id=$1",[collection(11),v8Factory]);
    assert.equal(await token(11,1),undefined,"a historical factory pin cannot authorize V10");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
