/**
 * @license Apache-2.0
 * @copyright 2023 Akiomi Kamakura
 */

import type { EventPacket } from "rx-nostr";
import { latestEach } from "rx-nostr";
import type { OperatorFunction } from "rxjs";
import { filter, map, pipe, scan } from "rxjs";
import { loginUser, queryClient } from "./stores";
import { get } from "svelte/store";

export function filterId(
  id: string
): OperatorFunction<EventPacket, EventPacket> {
  return filter((packet) => packet.event.id === id);
}

export function filterTextList(
  ids: string[]
): OperatorFunction<EventPacket, EventPacket> {
  return filter(({ event }) => event.kind === 1 && ids.includes(event.id));
}

export function filterPubkey(
  pubkey: string
): OperatorFunction<EventPacket, EventPacket> {
  return filter((packet) => packet.event.pubkey === pubkey);
}

export function filterMetadataList(
  pubkeys: string[]
): OperatorFunction<EventPacket, EventPacket> {
  return filter(
    ({ event }) => event.kind === 0 && pubkeys.includes(event.pubkey)
  );
}

export function filterNaddr(
  kind: number,
  pubkey: string,
  identifier: string
): OperatorFunction<EventPacket, EventPacket> {
  return filter(
    ({ event }) =>
      event.kind === kind &&
      event.pubkey === pubkey &&
      event.tags[0][1] === identifier
  );
}

export function latestEachPubkey(): OperatorFunction<EventPacket, EventPacket> {
  return latestEach(({ event }) => event.pubkey);
}

export function latestEachNaddr(): OperatorFunction<EventPacket, EventPacket> {
  return latestEach(
    ({ event }) => `${event.kind}:${event.pubkey}:${event.tags[0][1]}`
  );
}

export function scanArray<A>(): OperatorFunction<A, A[]> {
  return scan((acc: A[], a: A) => {
    // クエリデータの設定
    if ((a as EventPacket)?.event && (a as EventPacket)?.event?.id) {
      get(queryClient).setQueryData(["timeline", (a as any).event.id], a);
    }
    //reactionの場合どれへのリアクションかわかるようにしてくえりーにいれる
    if (
      (a as EventPacket)?.event &&
      (a as EventPacket)?.event?.kind === 7 &&
      (a as EventPacket)?.event?.pubkey === get(loginUser)
    ) {
      //  console.log(a);
      const id = (a as EventPacket).event.tags.find((tag) => tag[0] === "e");
      if (id) {
        get(queryClient).setQueryData(["reaction", id[1]], a);
      }
    }
    return [...acc, a];
  }, []);
}

export function collectGroupBy<A, K>(
  f: (a: A) => K
): OperatorFunction<A, Map<K, A[]>> {
  return pipe(
    scanArray(),
    map((xs) => {
      const dict = new Map<K, A[]>();
      xs.forEach((x) => {
        const key = f(x);
        const value = dict.get(key);
        if (value) {
          dict.set(key, [...value, x]);
        } else {
          dict.set(key, [x]);
        }
      });
      return dict;
    })
  );
}

export function scanLatestEach<A, K>(f: (a: A) => K): OperatorFunction<A, A[]> {
  return pipe(
    collectGroupBy(f),
    map((dict) =>
      Array.from(dict.entries()).map(([, value]) => value.slice(-1)[0])
    )
  );
}
