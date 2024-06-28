import { nip19 } from "nostr-tools";
//import { pubkey } from '$lib/stores/settings';
import { error } from "@sveltejs/kit";
import type { PageLoad, RouteParams } from "./$types";

interface CustomParams {
  note: string;
}
//https://kit.svelte.jp/docs/load
//ページを読み込む前に有効なparamかチェック
export const load: PageLoad<{
  id: string;
  relays?: string[] | undefined;
  kind?: number | undefined;
  author?: string | undefined;
}> = ({ params }: { params: RouteParams }) => {
  const { note } = params as CustomParams; // キャストして kind を取得

  console.log(note);

  try {
    const { type, data } = nip19.decode(note);

    console.log("[decode]", type, data);
    if (type === "nevent") {
      const nevent = data as nip19.EventPointer;
      return nevent;
    } else if (type === "note") {
      return { id: data as string };
    } else {
      throw Error;
    }
  } catch (e) {
    console.error("[note decode error]", e);
    throw error(404, "Not Found");
  }
};
