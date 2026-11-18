// import { writable } from "svelte/store";

// export const MAX_CHAT_MESSAGES = 2000;

// let localMessageSequence = 0;

// function createLocalId() {
//     localMessageSequence += 1;

//     return `local:${Date.now()}:${localMessageSequence}`;
// }

// function formatMessageTime(timestamp) {
//     const date = timestamp
//         ? new Date(timestamp)
//         : new Date();

//     if (Number.isNaN(date.getTime())) {
//         return "";
//     }

//     return date.toLocaleTimeString([], {
//         hour: "2-digit",
//         minute: "2-digit",
//     });
// }

// function normalizeMessage(message) {
//     const timestamp =
//         message.timestamp ??
//         Date.now();

//     const userDisplayName =
//         message.userDisplayName ??
//         message.displayName ??
//         message.name ??
//         message.userLogin ??
//         "";

//     const userLogin =
//         message.userLogin ??
//         message.login ??
//         message.name ??
//         "";

//     return {
//         id:
//             message.id ??
//             createLocalId(),

//         timestamp,

//         time:
//             message.time ??
//             formatMessageTime(timestamp),

//         userId:
//             message.userId ??
//             message.sender?.id ??
//             null,

//         userLogin:
//             String(userLogin).toLowerCase(),

//         userDisplayName,

//         /*
//          * Compatibilidade temporária com ChatMessage.svelte.
//          * Depois podemos remover "name" quando o componente
//          * passar a usar userDisplayName diretamente.
//          */
//         name: userDisplayName,

//         text:
//             message.text ??
//             "",

//         badge:
//             message.badge ??
//             null,

//         badges:
//             message.badges ??
//             [],

//         fragments:
//             message.fragments ??
//             [],

//         reply:
//             message.reply ??
//             null,

//         ...message,
//     };
// }

// function createChatMessagesStore() {
//     const { subscribe, update, set } = writable([]);

//     function add(message) {
//         if (!message) {
//             return null;
//         }

//         const normalized =
//             normalizeMessage(message);

//         update((messages) => {
//             /*
//              * Evita duplicação quando a Twitch reenviar
//              * um evento que já processamos.
//              */
//             const alreadyExists = messages.some(
//                 (item) => item.id === normalized.id,
//             );

//             if (alreadyExists) {
//                 return messages;
//             }

//             const nextMessages = [
//                 ...messages,
//                 normalized,
//             ];

//             if (
//                 nextMessages.length >
//                 MAX_CHAT_MESSAGES
//             ) {
//                 return nextMessages.slice(
//                     -MAX_CHAT_MESSAGES,
//                 );
//             }

//             return nextMessages;
//         });

//         return normalized;
//     }

//     function remove(id) {
//         update((messages) =>
//             messages.filter(
//                 (message) => message.id !== id,
//             ),
//         );
//     }

//     function clear() {
//         set([]);
//     }

//     return {
//         subscribe,

//         add,
//         remove,
//         clear,
//     };
// }

// export const chatMessages =
//     createChatMessagesStore();
