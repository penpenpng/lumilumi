import { nip19Regex, urlRegex, nipRegex } from "./util";

export interface Part {
  type:
    | "nip19"
    | "url"
    | "emoji"
    | "hashtag"
    | "nip"
    | "text"
    | "image"
    | "audio"
    | "movie"
    | "horizontal"
    | "bold"
    | "header"
    | "table"
    | "unorderedList"
    | "quote"
    | "codeBlock";
  content: string | undefined;
  url?: string;
  number?: number;
  headers?: string[];
  rows?: string[][];
}
/** ImageFile_Check_正規表現_パターン */
const imageRegex = /\.(gif|jpe?g|tiff?|png|webp|bmp)$/i;
//movie
const movieRegex = /\.(avi|mp4|mov|wmv|flv|mpg)$/i;

const audioRegex = /\.(mp3|wav|ogg|m4a)$/i;

//
const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i; // リンクの正規表現
const markdownImageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/i; // 画像の正規表現
const markdownHorizontalRuleRegex = /^-{4,}\s*$/m; // 水平線の正規表現

const boldTextRegex = /\*\*(.*?)\*\*/im;
const headerRegex = /^(#{1,4})\s+(.*)$/im;

const tableRegex = /^\|(.+?)\|\r?\n\|[-:| ]+\|\r?\n((?:\|(?:.+?)\|\r?\n)*)$/ims;
// 順序なしリストの正規表現
const unorderedListRegex = /^(\s*[-*+]\s.+)$/m; // 行頭の -、*、+ で始まる項目をキャッチ
const quoteRegex = /^(>>?)\s+(.*)$/im;
const codeBlockRegex = /```([\s\S]*?)```/m;

// パスから拡張子をチェックする関数
const checkFileExtension = (url: string): Part["type"] => {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    if (imageRegex.test(path)) {
      return "image";
    } else if (movieRegex.test(path)) {
      return "movie";
    } else if (audioRegex.test(path)) {
      return "audio";
    } else {
      return "url";
    }
  } catch (error) {
    return "text";
  }
};

export function parseText(input: string, tags: string[][]): Part[] {
  const parts: Part[] = [];
  let remainingText = input;
  let mediaNum = 0;
  // Create emoji set from tags
  const emojiSet = new Set(
    tags
      .filter((tag) => tag[0] === "emoji")
      .map((tag) => `:${tag[1]}:`)
      .sort((a, b) => b.length - a.length)
  );

  // Create hashtag set for exact matching
  //lowercaseにして重複削除
  const lowerHashtagSet = new Set(
    tags
      .filter((tag) => tag[0] === "t")
      .map((tag) => `#${tag[1].toLowerCase()}`) // lowercaseに変換
  );

  const hashtagSet = Array.from(lowerHashtagSet).sort(
    (a, b) => b.length - a.length
  );

  const findEmojiIndex = (
    text: string
  ): { index: number; emoji: string } | null => {
    let earliestIndex = -1;
    let foundEmoji = "";
    emojiSet.forEach((emoji) => {
      const index = text.indexOf(emoji);
      if (index !== -1 && (earliestIndex === -1 || index < earliestIndex)) {
        earliestIndex = index;
        foundEmoji = emoji;
      }
    });
    return earliestIndex !== -1
      ? { index: earliestIndex, emoji: foundEmoji }
      : null;
  };

  const findHashtagIndex = (
    text: string
  ): { index: number; hashtag: string } | null => {
    let earliestIndex = -1;
    let foundHashtag = "";
    hashtagSet.forEach((hashtag) => {
      const lowerCaseText = text.toLowerCase();
      const index = lowerCaseText.indexOf(hashtag);

      if (index !== -1 && (earliestIndex === -1 || index < earliestIndex)) {
        earliestIndex = index;
        // 元のテキストから一致部分を取得
        foundHashtag = text.slice(index, index + hashtag.length);
        // console.log(foundHashtag);
      }
    });
    return earliestIndex !== -1
      ? { index: earliestIndex, hashtag: foundHashtag }
      : null;
  };

  while (remainingText.length > 0) {
    const nip19Match = remainingText.match(nip19Regex);
    const urlMatch = remainingText.match(urlRegex);
    const emojiResult = findEmojiIndex(remainingText);
    const hashtagResult = findHashtagIndex(remainingText);
    const nipMatch = remainingText.match(nipRegex);

    const nip19Index = nip19Match ? remainingText.indexOf(nip19Match[0]) : -1;
    const urlIndex = urlMatch ? remainingText.indexOf(urlMatch[0]) : -1;
    const emojiIndex = emojiResult ? emojiResult.index : -1;
    const hashtagIndex = hashtagResult ? hashtagResult.index : -1;
    const nipIndex = nipMatch ? remainingText.indexOf(nipMatch[0]) : -1;

    if (
      nip19Index === -1 &&
      urlIndex === -1 &&
      emojiIndex === -1 &&
      hashtagIndex === -1 &&
      nipIndex === -1
    ) {
      // No more matches, add the remaining text as a normal text part
      parts.push({ type: "text", content: remainingText });
      break;
    }

    const earliestMatch = [
      { type: "nip19", index: nip19Index, match: nip19Match },
      { type: "url", index: urlIndex, match: urlMatch },
      {
        type: "emoji",
        index: emojiIndex,
        match: emojiResult ? [emojiResult.emoji] : null,
      },
      {
        type: "hashtag",
        index: hashtagIndex,
        match: hashtagResult ? [hashtagResult.hashtag] : null,
      },
      { type: "nip", index: nipIndex, match: nipMatch },
    ]
      .filter(({ index }) => index !== -1)
      .sort((a, b) => a.index - b.index)[0];

    const { type, index, match } = earliestMatch;

    if (index > 0) {
      parts.push({ type: "text", content: remainingText.slice(0, index) });
    }
    if (match) {
      switch (type) {
        case "nip19":
          parts.push({
            type: "nip19",
            content: match[0],
            url: match[0].slice(6),
          }); // Remove "nostr:" prefix
          break;
        case "url":
          const url = match[0];
          const lastUnpairedParenIndex = url.split("").reduce(
            (acc, char, idx) => {
              if (char === "(") acc.openParenCount++;
              if (char === ")") acc.closeParenCount++;
              if (
                acc.closeParenCount > acc.openParenCount &&
                acc.index === url.length
              ) {
                acc.index = idx;
              }
              return acc;
            },
            { openParenCount: 0, closeParenCount: 0, index: url.length }
          ).index;

          // Split the URL into its proper parts
          const urlPart = url.slice(0, lastUnpairedParenIndex);
          const textPart = url.slice(lastUnpairedParenIndex);

          const urlType = checkFileExtension(urlPart);
          if (
            urlType === "image" ||
            urlType === "audio" ||
            urlType === "movie"
          ) {
            parts.push({
              type: urlType,
              content: urlPart,
              url: urlPart,
              number: mediaNum,
            });
            mediaNum++;
          } else {
            parts.push({
              type: urlType,
              url: urlPart,
              content: urlPart,
            });
          }

          if (textPart) {
            parts.push({
              type: "text",
              content: textPart,
            });
          }
          break;
        case "emoji":
          const emojiContent = match[0].slice(1, -1); // Remove surrounding colons
          const matchingTag = tags.find(
            (tag) => tag[0] === "emoji" && tag[1] === emojiContent
          );
          parts.push({
            type: "emoji",
            url: matchingTag ? matchingTag[2] : undefined,
            content: emojiContent,
          });
          break;
        case "hashtag":
          parts.push({
            type: "hashtag",
            content: match[0].slice(1),
            url: match[0].slice(1).toLowerCase(),
          }); // Remove leading '#'
          break;
        case "nip":
          parts.push({
            type: "nip",
            content: match[0],
            url: `https://github.com/nostr-protocol/nips/blob/master/${match?.[0].slice(
              4
            )}.md`, // Remove "nip-" prefix
          });
          break;
      }

      remainingText = remainingText.slice(
        index + (match as RegExpMatchArray)[0].length
      );
    }
  }

  return parts;
}

export function parseMarkdownText(input: string, tags: string[][]): Part[] {
  const parts: Part[] = [];
  let remainingText = input;
  let mediaNum = 0;
  // Create emoji set from tags
  const emojiSet = new Set(
    tags
      .filter((tag) => tag[0] === "emoji")
      .map((tag) => `:${tag[1]}:`)
      .sort((a, b) => b.length - a.length)
  );

  // Create hashtag set for exact matching
  //lowercaseにして重複削除
  const lowerHashtagSet = new Set(
    tags
      .filter((tag) => tag[0] === "t")
      .map((tag) => `#${tag[1].toLowerCase()}`) // lowercaseに変換
  );

  const hashtagSet = Array.from(lowerHashtagSet).sort(
    (a, b) => b.length - a.length
  );

  const findEmojiIndex = (
    text: string
  ): { index: number; emoji: string } | null => {
    let earliestIndex = -1;
    let foundEmoji = "";
    emojiSet.forEach((emoji) => {
      const index = text.indexOf(emoji);
      if (index !== -1 && (earliestIndex === -1 || index < earliestIndex)) {
        earliestIndex = index;
        foundEmoji = emoji;
      }
    });
    return earliestIndex !== -1
      ? { index: earliestIndex, emoji: foundEmoji }
      : null;
  };

  const findHashtagIndex = (
    text: string
  ): { index: number; hashtag: string } | null => {
    let earliestIndex = -1;
    let foundHashtag = "";
    hashtagSet.forEach((hashtag) => {
      const lowerCaseText = text.toLowerCase();
      const index = lowerCaseText.indexOf(hashtag);

      if (index !== -1 && (earliestIndex === -1 || index < earliestIndex)) {
        earliestIndex = index;
        // 元のテキストから一致部分を取得
        foundHashtag = text.slice(index, index + hashtag.length);
        // console.log(foundHashtag);
      }
    });
    return earliestIndex !== -1
      ? { index: earliestIndex, hashtag: foundHashtag }
      : null;
  };

  while (remainingText.length > 0) {
    const codeBlockMatch = remainingText.match(codeBlockRegex);
    const quoteMatch = remainingText.match(quoteRegex); // 順序なしリストのマッチ
    const unorderedListMatch = remainingText.match(unorderedListRegex); // 順序なしリストのマッチ

    // テーブルのマッチ
    const tableMatch = remainingText.match(tableRegex);
    const headerMatch = remainingText.match(headerRegex);
    const boldMatch = remainingText.match(boldTextRegex); // 太字のマッチ
    const markdownLinkMatch = remainingText.match(markdownLinkRegex); // Markdownリンクのマッチ
    const markdownImageMatch = remainingText.match(markdownImageRegex); // Markdownリンクのマッチ

    const horizontalRuleMatch = remainingText.match(
      markdownHorizontalRuleRegex
    ); // 水平線のマッチ
    const nip19Match = remainingText.match(nip19Regex);
    const urlMatch = remainingText.match(markdownLinkRegex);
    const emojiResult = findEmojiIndex(remainingText);
    const hashtagResult = findHashtagIndex(remainingText);
    const nipMatch = remainingText.match(nipRegex);

    //

    const codeBlockIndex = codeBlockMatch
      ? remainingText.indexOf(codeBlockMatch[0])
      : -1;
    const quoteIndex = quoteMatch ? remainingText.indexOf(quoteMatch[0]) : -1;
    const unorderedListIndex = unorderedListMatch
      ? remainingText.indexOf(unorderedListMatch[0])
      : -1;

    const tableIndex = tableMatch ? remainingText.indexOf(tableMatch[0]) : -1;
    const headerIndex = headerMatch
      ? remainingText.indexOf(headerMatch[0])
      : -1;
    const boldIndex = boldMatch ? remainingText.indexOf(boldMatch[0]) : -1;
    const markdownLinkIndex = markdownLinkMatch
      ? remainingText.indexOf(markdownLinkMatch[0])
      : -1; // Markdownリンクのインデックス
    const markdownImageIndex = markdownImageMatch
      ? remainingText.indexOf(markdownImageMatch[0])
      : -1; // Markdownリンクのインデックス
    const horizontalRuleIndex = horizontalRuleMatch
      ? remainingText.indexOf(horizontalRuleMatch[0])
      : -1; // 水平線のインデックス
    const nip19Index = nip19Match ? remainingText.indexOf(nip19Match[0]) : -1;

    const urlIndex = urlMatch ? remainingText.indexOf(urlMatch[0]) : -1;
    const emojiIndex = emojiResult ? emojiResult.index : -1;
    const hashtagIndex = hashtagResult ? hashtagResult.index : -1;
    const nipIndex = nipMatch ? remainingText.indexOf(nipMatch[0]) : -1;

    if (
      codeBlockIndex === -1 &&
      quoteIndex === -1 &&
      unorderedListIndex === -1 &&
      tableIndex === -1 &&
      headerIndex === -1 &&
      boldIndex === -1 &&
      nip19Index === -1 &&
      markdownLinkIndex === -1 &&
      markdownImageIndex === -1 &&
      horizontalRuleIndex === -1 &&
      urlIndex === -1 &&
      emojiIndex === -1 &&
      hashtagIndex === -1 &&
      nipIndex === -1
    ) {
      // No more matches, add the remaining text as a normal text part
      parts.push({ type: "text", content: remainingText });
      break;
    }

    const earliestMatch = [
      {
        type: "codeBlock",
        index: codeBlockIndex,
        match: codeBlockMatch,
      },
      {
        type: "quote",
        index: quoteIndex,
        match: quoteMatch,
      },
      {
        type: "unorderedList",
        index: unorderedListIndex,
        match: unorderedListMatch,
      },
      { type: "table", index: tableIndex, match: tableMatch }, // テーブルのマッチ
      {
        type: "header",
        index: headerIndex,
        match: headerMatch,
      },
      {
        type: "bold",
        index: boldIndex,
        match: boldMatch,
      },
      {
        type: "markdownLink",
        index: markdownLinkIndex,
        match: markdownLinkMatch,
      }, // Markdownリンクのマッチ
      {
        type: "markdownImage",
        index: markdownImageIndex,
        match: markdownImageMatch,
      }, // Markdownリンクのマッチ
      {
        type: "horizontalRule",
        index: horizontalRuleIndex,
        match: horizontalRuleMatch,
      },
      { type: "nip19", index: nip19Index, match: nip19Match },
      { type: "url", index: urlIndex, match: urlMatch },
      {
        type: "emoji",
        index: emojiIndex,
        match: emojiResult ? [emojiResult.emoji] : null,
      },
      {
        type: "hashtag",
        index: hashtagIndex,
        match: hashtagResult ? [hashtagResult.hashtag] : null,
      },
      { type: "nip", index: nipIndex, match: nipMatch },
    ]
      .filter(({ index }) => index !== -1)
      .sort((a, b) => a.index - b.index)[0];

    const { type, index, match } = earliestMatch;

    if (index > 0) {
      parts.push({ type: "text", content: remainingText.slice(0, index) });
    }
    if (match) {
      switch (type) {
        case "codeBlock":
          console.log(match);
          parts.push({
            type: "codeBlock",
            content: match[1],
          });
          break;
        case "quote":
          parts.push({
            type: "quote",
            content: match[2],
          });
          break;
        case "unorderedList":
          // リスト項目から `- `、`* `、`+ ` を削除し、リストとして処理する
          parts.push({
            type: "unorderedList",
            content: match[0].replace(/^\s*[-*+]\s/, ""),
          });
          break;
        case "table":
          // テーブル処理

          const [, headerRow, dataRows] = match;
          const headers = headerRow
            .slice(1, -1)
            .split("|")
            .map((h) => h.trim());
          const rows = dataRows
            .split("\n") // Split text into lines
            .map(
              (line) =>
                line
                  .split("|") // Split each line by '|'
                  .map((cell) => cell.trim()) // Trim whitespace from each cell
                  .filter((cell) => cell.length > 0) // Remove empty cells
            );

          parts.push({ content: "", type: "table", headers, rows });
          break;
        case "header":
          const headerLevel = match[1].length; // ヘッダーのレベルを取得
          parts.push({
            type: "header",
            number: headerLevel,
            content: match[2],
          });
          break;
        case "bold":
          parts.push({
            type: "bold",
            content: match[1],
          });
          break;
        case "markdownImage": // Markdownリンクの処理
          parts.push({
            type: "image",
            content: match[1], // リンクテキスト
            url: match[2], // URL
          });
          break;
        case "markdownLink": // Markdownリンクの処理
          parts.push({
            type: "url",
            content: match[1], // リンクテキスト
            url: match[2], // URL
          });
          break;
        case "horizontalRule": // 水平線の処理
          parts.push({
            type: "horizontal",
            content: "----",
          });
          break;

        case "url":
          const url = match[0];
          const lastUnpairedParenIndex = url.split("").reduce(
            (acc, char, idx) => {
              if (char === "(") acc.openParenCount++;
              if (char === ")") acc.closeParenCount++;
              if (
                acc.closeParenCount > acc.openParenCount &&
                acc.index === url.length
              ) {
                acc.index = idx;
              }
              return acc;
            },
            { openParenCount: 0, closeParenCount: 0, index: url.length }
          ).index;

          // Split the URL into its proper parts
          const urlPart = url.slice(0, lastUnpairedParenIndex);
          const textPart = url.slice(lastUnpairedParenIndex);

          const urlType = checkFileExtension(urlPart);
          if (
            urlType === "image" ||
            urlType === "audio" ||
            urlType === "movie"
          ) {
            parts.push({
              type: urlType,
              content: urlPart,
              url: urlPart,
              number: mediaNum,
            });
            mediaNum++;
          } else {
            parts.push({
              type: urlType,
              content: urlPart,
              url: urlPart,
            });
          }

          if (textPart) {
            parts.push({
              type: "text",
              content: textPart,
            });
          }
          break;
        case "nip19":
          parts.push({
            type: "nip19",
            content: match[0],
            url: match[0].slice(6),
          }); // Remove "nostr:" prefix
          break;
        case "emoji":
          const emojiContent = match[0].slice(1, -1); // Remove surrounding colons
          const matchingTag = tags.find(
            (tag) => tag[0] === "emoji" && tag[1] === emojiContent
          );
          parts.push({
            type: "emoji",
            url: matchingTag ? matchingTag[2] : undefined,
            content: emojiContent,
          });
          break;
        case "hashtag":
          parts.push({
            type: "hashtag",
            content: match[0].slice(1),
            url: match[0].slice(1).toLowerCase(),
          }); // Remove leading '#'
          break;
        case "nip":
          parts.push({
            type: "nip",
            content: match[0],
            url: `https://github.com/nostr-protocol/nips/blob/master/${match?.[0].slice(
              4
            )}.md`, // Remove "nip-" prefix
          });
          break;
      }

      remainingText = remainingText.slice(
        index + (match as RegExpMatchArray)[0].length
      );
    }
  }

  return parts;
}
