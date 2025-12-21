import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/**
 * Convert emoji shortcodes (e.g., :smile:, :rocket:) and HTML entities to unicode emojis.
 * This ensures imported content displays correctly with twemoji rendering.
 */
const EMOJI_SHORTCODE_MAP: Record<string, string> = {
  // Smileys & Emotion
  ':smile:': '😄', ':smiley:': '😃', ':grinning:': '😀', ':grin:': '😁',
  ':laughing:': '😆', ':sweat_smile:': '😅', ':joy:': '😂', ':rofl:': '🤣',
  ':relaxed:': '☺️', ':blush:': '😊', ':innocent:': '😇', ':wink:': '😉',
  ':heart_eyes:': '😍', ':smiling_face_with_three_hearts:': '🥰', ':kissing_heart:': '😘',
  ':kissing:': '😗', ':kissing_smiling_eyes:': '😙', ':kissing_closed_eyes:': '😚',
  ':yum:': '😋', ':stuck_out_tongue:': '😛', ':stuck_out_tongue_winking_eye:': '😜',
  ':stuck_out_tongue_closed_eyes:': '😝', ':zany_face:': '🤪', ':money_mouth_face:': '🤑',
  ':hugs:': '🤗', ':thinking:': '🤔', ':zipper_mouth_face:': '🤐', ':raised_eyebrow:': '🤨',
  ':neutral_face:': '😐', ':expressionless:': '😑', ':no_mouth:': '😶', ':smirk:': '😏',
  ':unamused:': '😒', ':roll_eyes:': '🙄', ':grimacing:': '😬', ':lying_face:': '🤥',
  ':relieved:': '😌', ':pensive:': '😔', ':sleepy:': '😪', ':drooling_face:': '🤤',
  ':sleeping:': '😴', ':mask:': '😷', ':face_with_thermometer:': '🤒',
  ':face_with_head_bandage:': '🤕', ':nauseated_face:': '🤢', ':sneezing_face:': '🤧',
  ':hot_face:': '🥵', ':cold_face:': '🥶', ':woozy_face:': '🥴', ':dizzy_face:': '😵',
  ':exploding_head:': '🤯', ':cowboy_hat_face:': '🤠', ':partying_face:': '🥳',
  ':sunglasses:': '😎', ':nerd_face:': '🤓', ':monocle_face:': '🧐', ':confused:': '😕',
  ':worried:': '😟', ':slightly_frowning_face:': '🙁', ':frowning_face:': '☹️',
  ':open_mouth:': '😮', ':hushed:': '😯', ':astonished:': '😲', ':flushed:': '😳',
  ':pleading_face:': '🥺', ':frowning:': '😦', ':anguished:': '😧', ':fearful:': '😨',
  ':cold_sweat:': '😰', ':disappointed_relieved:': '😥', ':cry:': '😢', ':sob:': '😭',
  ':scream:': '😱', ':confounded:': '😖', ':persevere:': '😣', ':disappointed:': '😞',
  ':sweat:': '😓', ':weary:': '😩', ':tired_face:': '😫', ':yawning_face:': '🥱',
  ':triumph:': '😤', ':rage:': '😡', ':angry:': '😠', ':cursing_face:': '🤬',
  ':smiling_imp:': '😈', ':imp:': '👿', ':skull:': '💀', ':skull_and_crossbones:': '☠️',
  ':poop:': '💩', ':hankey:': '💩', ':clown_face:': '🤡', ':japanese_ogre:': '👹',
  ':japanese_goblin:': '👺', ':ghost:': '👻', ':alien:': '👽', ':space_invader:': '👾',
  ':robot:': '🤖', ':smiley_cat:': '😺', ':smile_cat:': '😸', ':joy_cat:': '😹',
  ':heart_eyes_cat:': '😻', ':smirk_cat:': '😼', ':kissing_cat:': '😽',
  ':scream_cat:': '🙀', ':crying_cat_face:': '😿', ':pouting_cat:': '😾',
  ':see_no_evil:': '🙈', ':hear_no_evil:': '🙉', ':speak_no_evil:': '🙊',
  // Hearts & Love
  ':heart:': '❤️', ':red_heart:': '❤️', ':orange_heart:': '🧡', ':yellow_heart:': '💛',
  ':green_heart:': '💚', ':blue_heart:': '💙', ':purple_heart:': '💜', ':black_heart:': '🖤',
  ':white_heart:': '🤍', ':brown_heart:': '🤎', ':broken_heart:': '💔', ':heartbeat:': '💓',
  ':heartpulse:': '💗', ':two_hearts:': '💕', ':revolving_hearts:': '💞',
  ':sparkling_heart:': '💖', ':cupid:': '💘', ':gift_heart:': '💝', ':heart_decoration:': '💟',
  // Hands & Gestures
  ':wave:': '👋', ':raised_back_of_hand:': '🤚', ':hand:': '✋', ':raised_hand:': '✋',
  ':vulcan_salute:': '🖖', ':ok_hand:': '👌', ':pinching_hand:': '🤏', ':v:': '✌️',
  ':crossed_fingers:': '🤞', ':love_you_gesture:': '🤟', ':metal:': '🤘',
  ':call_me_hand:': '🤙', ':point_left:': '👈', ':point_right:': '👉', ':point_up:': '☝️',
  ':point_up_2:': '👆', ':middle_finger:': '🖕', ':point_down:': '👇', ':thumbsup:': '👍',
  ':+1:': '👍', ':thumbsdown:': '👎', ':-1:': '👎', ':fist:': '✊', ':punch:': '👊',
  ':fist_left:': '🤛', ':fist_right:': '🤜', ':clap:': '👏', ':raised_hands:': '🙌',
  ':open_hands:': '👐', ':palms_up_together:': '🤲', ':handshake:': '🤝', ':pray:': '🙏',
  ':writing_hand:': '✍️', ':nail_care:': '💅', ':selfie:': '🤳', ':muscle:': '💪',
  // Objects & Symbols
  ':fire:': '🔥', ':star:': '⭐', ':sparkles:': '✨', ':boom:': '💥', ':zap:': '⚡',
  ':sunny:': '☀️', ':cloud:': '☁️', ':rainbow:': '🌈', ':umbrella:': '☂️',
  ':snowflake:': '❄️', ':comet:': '☄️', ':ocean:': '🌊',
  ':rocket:': '🚀', ':airplane:': '✈️', ':helicopter:': '🚁', ':car:': '🚗',
  ':taxi:': '🚕', ':bus:': '🚌', ':ambulance:': '🚑', ':fire_engine:': '🚒',
  ':bike:': '🚲', ':ship:': '🚢', ':anchor:': '⚓', ':construction:': '🚧',
  ':bell:': '🔔', ':no_bell:': '🔕', ':musical_note:': '🎵', ':notes:': '🎶',
  ':microphone:': '🎤', ':headphones:': '🎧', ':guitar:': '🎸', ':trumpet:': '🎺',
  ':violin:': '🎻', ':drum:': '🥁', ':piano:': '🎹', ':saxophone:': '🎷',
  ':camera:': '📷', ':video_camera:': '📹', ':movie_camera:': '🎥', ':tv:': '📺',
  ':computer:': '💻', ':keyboard:': '⌨️', ':desktop_computer:': '🖥️', ':printer:': '🖨️',
  ':phone:': '📞', ':telephone:': '☎️', ':iphone:': '📱', ':fax:': '📠',
  ':battery:': '🔋', ':electric_plug:': '🔌', ':bulb:': '💡', ':flashlight:': '🔦',
  ':cd:': '💿', ':dvd:': '📀', ':floppy_disk:': '💾', ':minidisc:': '💽',
  ':book:': '📖', ':books:': '📚', ':notebook:': '📓', ':ledger:': '📒',
  ':page_facing_up:': '📄', ':scroll:': '📜', ':memo:': '📝', ':pencil:': '✏️',
  ':pen:': '🖊️', ':fountain_pen:': '🖋️', ':paintbrush:': '🖌️', ':crayon:': '🖍️',
  ':mag:': '🔍', ':mag_right:': '🔎', ':lock:': '🔒', ':unlock:': '🔓',
  ':key:': '🔑', ':hammer:': '🔨', ':axe:': '🪓', ':wrench:': '🔧', ':screwdriver:': '🪛',
  ':gear:': '⚙️', ':link:': '🔗', ':chains:': '⛓️', ':scissors:': '✂️',
  ':envelope:': '✉️', ':email:': '📧', ':inbox_tray:': '📥', ':outbox_tray:': '📤',
  ':package:': '📦', ':mailbox:': '📫', ':postbox:': '📮', ':newspaper:': '📰',
  ':calendar:': '📅', ':date:': '📅', ':spiral_calendar:': '🗓️', ':clock:': '🕐',
  ':hourglass:': '⌛', ':stopwatch:': '⏱️', ':timer_clock:': '⏲️', ':alarm_clock:': '⏰',
  ':trophy:': '🏆', ':medal:': '🏅', ':1st_place_medal:': '🥇', ':2nd_place_medal:': '🥈',
  ':3rd_place_medal:': '🥉', ':soccer:': '⚽', ':baseball:': '⚾', ':basketball:': '🏀',
  ':football:': '🏈', ':tennis:': '🎾', ':golf:': '⛳', ':bowling:': '🎳',
  ':dart:': '🎯', ':game_die:': '🎲', ':chess_pawn:': '♟️', ':jigsaw:': '🧩',
  ':art:': '🎨', ':performing_arts:': '🎭', ':ticket:': '🎫', ':clapper:': '🎬',
  ':gift:': '🎁', ':balloon:': '🎈', ':tada:': '🎉', ':confetti_ball:': '🎊',
  ':ribbon:': '🎀', ':dolls:': '🎎', ':flags:': '🎏', ':wind_chime:': '🎐',
  // Food & Drink
  ':apple:': '🍎', ':green_apple:': '🍏', ':pear:': '🍐', ':tangerine:': '🍊',
  ':lemon:': '🍋', ':banana:': '🍌', ':watermelon:': '🍉', ':grapes:': '🍇',
  ':strawberry:': '🍓', ':cherries:': '🍒', ':peach:': '🍑', ':mango:': '🥭',
  ':pineapple:': '🍍', ':coconut:': '🥥', ':kiwi_fruit:': '🥝', ':tomato:': '🍅',
  ':avocado:': '🥑', ':eggplant:': '🍆', ':potato:': '🥔', ':carrot:': '🥕',
  ':corn:': '🌽', ':hot_pepper:': '🌶️', ':cucumber:': '🥒', ':broccoli:': '🥦',
  ':mushroom:': '🍄', ':peanuts:': '🥜', ':chestnut:': '🌰',
  ':bread:': '🍞', ':croissant:': '🥐', ':baguette_bread:': '🥖', ':pretzel:': '🥨',
  ':bagel:': '🥯', ':pancakes:': '🥞', ':waffle:': '🧇', ':cheese:': '🧀',
  ':meat_on_bone:': '🍖', ':poultry_leg:': '🍗', ':bacon:': '🥓', ':hamburger:': '🍔',
  ':fries:': '🍟', ':pizza:': '🍕', ':hotdog:': '🌭', ':sandwich:': '🥪',
  ':taco:': '🌮', ':burrito:': '🌯', ':egg:': '🥚', ':fried_egg:': '🍳',
  ':salad:': '🥗', ':popcorn:': '🍿', ':salt:': '🧂', ':canned_food:': '🥫',
  ':spaghetti:': '🍝', ':ramen:': '🍜', ':stew:': '🍲', ':curry:': '🍛',
  ':sushi:': '🍣', ':fried_shrimp:': '🍤', ':rice:': '🍚', ':rice_ball:': '🍙',
  ':ice_cream:': '🍨', ':shaved_ice:': '🍧', ':icecream:': '🍦', ':doughnut:': '🍩',
  ':cookie:': '🍪', ':cake:': '🍰', ':birthday:': '🎂', ':cupcake:': '🧁',
  ':pie:': '🥧', ':chocolate_bar:': '🍫', ':candy:': '🍬', ':lollipop:': '🍭',
  ':custard:': '🍮', ':honey_pot:': '🍯',
  ':coffee:': '☕', ':tea:': '🍵', ':sake:': '🍶', ':champagne:': '🍾',
  ':wine_glass:': '🍷', ':cocktail:': '🍸', ':tropical_drink:': '🍹', ':beer:': '🍺',
  ':beers:': '🍻', ':tumbler_glass:': '🥃', ':cup_with_straw:': '🥤',
  // Nature & Animals
  ':dog:': '🐕', ':dog2:': '🐶', ':cat:': '🐈', ':cat2:': '🐱', ':mouse:': '🐁',
  ':mouse2:': '🐭', ':hamster:': '🐹', ':rabbit:': '🐇', ':rabbit2:': '🐰',
  ':fox_face:': '🦊', ':bear:': '🐻', ':panda_face:': '🐼', ':koala:': '🐨',
  ':tiger:': '🐅', ':tiger2:': '🐯', ':lion:': '🦁', ':cow:': '🐄', ':cow2:': '🐮',
  ':pig:': '🐖', ':pig2:': '🐷', ':pig_nose:': '🐽', ':frog:': '🐸', ':monkey:': '🐒',
  ':monkey_face:': '🐵', ':gorilla:': '🦍', ':elephant:': '🐘', ':rhino:': '🦏',
  ':hippo:': '🦛', ':camel:': '🐫', ':giraffe:': '🦒', ':kangaroo:': '🦘',
  ':water_buffalo:': '🐃', ':ox:': '🐂', ':deer:': '🦌', ':llama:': '🦙',
  ':horse:': '🐴', ':unicorn:': '🦄', ':zebra:': '🦓', ':donkey:': '🫏',
  ':chicken:': '🐔', ':rooster:': '🐓', ':hatching_chick:': '🐣', ':baby_chick:': '🐤',
  ':hatched_chick:': '🐥', ':bird:': '🐦', ':penguin:': '🐧', ':dove:': '🕊️',
  ':eagle:': '🦅', ':duck:': '🦆', ':swan:': '🦢', ':owl:': '🦉', ':flamingo:': '🦩',
  ':peacock:': '🦚', ':parrot:': '🦜', ':crocodile:': '🐊', ':turtle:': '🐢',
  ':lizard:': '🦎', ':snake:': '🐍', ':dragon_face:': '🐲', ':dragon:': '🐉',
  ':sauropod:': '🦕', ':t_rex:': '🦖', ':whale:': '🐳', ':whale2:': '🐋',
  ':dolphin:': '🐬', ':fish:': '🐟', ':tropical_fish:': '🐠', ':blowfish:': '🐡',
  ':shark:': '🦈', ':octopus:': '🐙', ':shell:': '🐚', ':crab:': '🦀',
  ':lobster:': '🦞', ':shrimp:': '🦐', ':squid:': '🦑', ':snail:': '🐌',
  ':butterfly:': '🦋', ':bug:': '🐛', ':ant:': '🐜', ':honeybee:': '🐝', ':bee:': '🐝',
  ':beetle:': '🪲', ':ladybug:': '🐞', ':cricket:': '🦗', ':cockroach:': '🪳',
  ':spider:': '🕷️', ':spider_web:': '🕸️', ':scorpion:': '🦂', ':mosquito:': '🦟',
  ':fly:': '🪰', ':worm:': '🪱', ':microbe:': '🦠',
  ':bouquet:': '💐', ':cherry_blossom:': '🌸', ':white_flower:': '💮', ':rosette:': '🏵️',
  ':rose:': '🌹', ':wilted_flower:': '🥀', ':hibiscus:': '🌺', ':sunflower:': '🌻',
  ':blossom:': '🌼', ':tulip:': '🌷', ':seedling:': '🌱', ':evergreen_tree:': '🌲',
  ':deciduous_tree:': '🌳', ':palm_tree:': '🌴', ':cactus:': '🌵', ':herb:': '🌿',
  ':shamrock:': '☘️', ':four_leaf_clover:': '🍀', ':maple_leaf:': '🍁',
  ':fallen_leaf:': '🍂', ':leaves:': '🍃',
  // Checkmarks & Status
  ':white_check_mark:': '✅', ':check:': '✔️', ':heavy_check_mark:': '✔️',
  ':ballot_box_with_check:': '☑️', ':x:': '❌', ':negative_squared_cross_mark:': '❎',
  ':heavy_multiplication_x:': '✖️', ':exclamation:': '❗', ':question:': '❓',
  ':grey_exclamation:': '❕', ':grey_question:': '❔', ':bangbang:': '‼️',
  ':interrobang:': '⁉️', ':warning:': '⚠️', ':no_entry:': '⛔', ':prohibited:': '🚫',
  ':100:': '💯', ':low_brightness:': '🔅', ':high_brightness:': '🔆',
  // Arrows & Directions
  ':arrow_up:': '⬆️', ':arrow_down:': '⬇️', ':arrow_left:': '⬅️', ':arrow_right:': '➡️',
  ':arrow_upper_left:': '↖️', ':arrow_upper_right:': '↗️', ':arrow_lower_left:': '↙️',
  ':arrow_lower_right:': '↘️', ':left_right_arrow:': '↔️', ':arrow_up_down:': '↕️',
  ':arrows_counterclockwise:': '🔄', ':arrows_clockwise:': '🔃',
  ':back:': '🔙', ':end:': '🔚', ':on:': '🔛', ':soon:': '🔜', ':top:': '🔝',
  // Miscellaneous
  ':new:': '🆕', ':free:': '🆓', ':up:': '🆙', ':cool:': '🆒', ':ok:': '🆗',
  ':ng:': '🆖', ':sos:': '🆘', ':id:': '🆔', ':vs:': '🆚', ':koko:': '🈁',
  ':information_source:': 'ℹ️', ':abc:': '🔤', ':abcd:': '🔡', ':capital_abcd:': '🔠',
  ':symbols:': '🔣', ':1234:': '🔢', ':hash:': '#️⃣', ':asterisk:': '*️⃣',
  ':zero:': '0️⃣', ':one:': '1️⃣', ':two:': '2️⃣', ':three:': '3️⃣', ':four:': '4️⃣',
  ':five:': '5️⃣', ':six:': '6️⃣', ':seven:': '7️⃣', ':eight:': '8️⃣', ':nine:': '9️⃣',
  ':keycap_ten:': '🔟',
  ':a:': '🅰️', ':b:': '🅱️', ':ab:': '🆎', ':o:': '⭕', ':o2:': '🅾️',
  ':parking:': '🅿️', ':copyright:': '©️', ':registered:': '®️', ':tm:': '™️',
  ':recycle:': '♻️', ':fleur_de_lis:': '⚜️', ':beginner:': '🔰', ':trident:': '🔱',
  ':name_badge:': '📛', ':japanese_symbol:': '🈂️',
  ':red_circle:': '🔴', ':orange_circle:': '🟠', ':yellow_circle:': '🟡',
  ':green_circle:': '🟢', ':blue_circle:': '🔵', ':purple_circle:': '🟣',
  ':brown_circle:': '🟤', ':black_circle:': '⚫', ':white_circle:': '⚪',
  ':red_square:': '🟥', ':orange_square:': '🟧', ':yellow_square:': '🟨',
  ':green_square:': '🟩', ':blue_square:': '🟦', ':purple_square:': '🟪',
  ':brown_square:': '🟫', ':black_square:': '⬛', ':white_square:': '⬜',
  ':black_small_square:': '▪️', ':white_small_square:': '▫️',
  ':black_medium_square:': '◼️', ':white_medium_square:': '◻️',
  ':black_medium_small_square:': '◾', ':white_medium_small_square:': '◽',
  ':black_large_square:': '⬛', ':white_large_square:': '⬜',
  ':diamond_shape_with_a_dot_inside:': '💠', ':small_orange_diamond:': '🔸',
  ':small_blue_diamond:': '🔹', ':large_orange_diamond:': '🔶', ':large_blue_diamond:': '🔷',
};

/**
 * Convert emoji shortcodes to unicode emojis
 */
function convertEmojiShortcodes(text: string): string {
  if (!text) return text;
  
  let result = text;
  
  // Convert shortcodes like :smile: to unicode emojis
  for (const [shortcode, emoji] of Object.entries(EMOJI_SHORTCODE_MAP)) {
    // Use case-insensitive replacement
    const regex = new RegExp(shortcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, emoji);
  }
  
  // Handle HTML entities for common emojis (&#x1F...; format)
  result = result.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    try {
      const codePoint = parseInt(hex, 16);
      return String.fromCodePoint(codePoint);
    } catch {
      return match; // Return original if conversion fails
    }
  });
  
  // Handle decimal HTML entities (&#128512; format)
  result = result.replace(/&#(\d+);/g, (match, dec) => {
    try {
      const codePoint = parseInt(dec, 10);
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  });
  
  // Handle Wekan/Trello specific emoji image tags and convert to unicode
  // Pattern: <img class="emoji" alt=":emoji:" src="..."> or similar
  result = result.replace(/<img[^>]*class=["'][^"']*emoji[^"']*["'][^>]*alt=["']([^"']+)["'][^>]*>/gi, (match, alt) => {
    // Try to convert the alt text shortcode to emoji
    const shortcode = alt.trim().toLowerCase();
    if (EMOJI_SHORTCODE_MAP[shortcode]) {
      return EMOJI_SHORTCODE_MAP[shortcode];
    }
    // If it's already a unicode emoji in alt, use it
    if (/[\u{1F300}-\u{1F9FF}]/u.test(alt)) {
      return alt;
    }
    return alt; // Return alt text if no match
  });
  
  // Also handle img tags where alt comes before class
  result = result.replace(/<img[^>]*alt=["']([^"']+)["'][^>]*class=["'][^"']*emoji[^"']*["'][^>]*>/gi, (match, alt) => {
    const shortcode = alt.trim().toLowerCase();
    if (EMOJI_SHORTCODE_MAP[shortcode]) {
      return EMOJI_SHORTCODE_MAP[shortcode];
    }
    if (/[\u{1F300}-\u{1F9FF}]/u.test(alt)) {
      return alt;
    }
    return alt;
  });
  
  return result;
}

// Regex to detect Wekan inline button blocks with all the details we need
// These are spans with display: inline-flex containing an img and anchor
const INLINE_BUTTON_FULL_REGEX = /<span[^>]*style=['"]([^'"]*display:\s*inline-?flex[^'"]*)['"][^>]*>([\s\S]*?)<\/span>/gi;
const IMG_SRC_REGEX = /<img[^>]*src=['"]([^'"]+)['"][^>]*(?:style=['"]([^'"]+)['"])?[^>]*>/i;
const IMG_WIDTH_REGEX = /width:\s*(\d+)/i;
const ANCHOR_REGEX = /<a[^>]*href=['"]([^'"]+)['"][^>]*>([^<]*)<\/a>/i;
const BG_COLOR_REGEX = /background(?:-color)?:\s*([^;'"]+)/i;
const COLOR_REGEX = /(?:^|[^-])color:\s*([^;'"]+)/i;

interface InlineButtonData {
  id: string;
  iconUrl: string;
  iconSize: number;
  linkUrl: string;
  linkText: string;
  textColor: string;
  backgroundColor: string;
}

/**
 * Parse a Wekan inline button span into structured data
 */
function parseWekanInlineButton(match: string, spanStyle: string, innerHtml: string): InlineButtonData | null {
  const imgMatch = innerHtml.match(IMG_SRC_REGEX);
  const anchorMatch = innerHtml.match(ANCHOR_REGEX);
  
  if (!anchorMatch) return null;
  
  const iconUrl = imgMatch?.[1] || '';
  const imgStyle = imgMatch?.[2] || '';
  const iconSizeMatch = imgStyle.match(IMG_WIDTH_REGEX);
  const iconSize = iconSizeMatch ? parseInt(iconSizeMatch[1], 10) : 16;
  
  const bgColorMatch = spanStyle.match(BG_COLOR_REGEX);
  const textColorMatch = innerHtml.match(COLOR_REGEX) || spanStyle.match(COLOR_REGEX);
  
  return {
    id: `wekan-btn-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    iconUrl,
    iconSize: iconSize || 16,
    linkUrl: anchorMatch[1] || '',
    linkText: anchorMatch[2]?.trim() || 'Button',
    textColor: textColorMatch?.[1]?.trim() || '#579DFF',
    backgroundColor: bgColorMatch?.[1]?.trim() || '#1D2125',
  };
}

/**
 * Serialize inline button data to our Markdown-compatible format.
 * Uses [INLINE_BUTTON:base64Data] which MarkdownRenderer can parse.
 */
function serializeInlineButton(data: InlineButtonData): string {
  const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return `[INLINE_BUTTON:${encodedData}]`;
}

/**
 * Convert Wekan inline buttons to editable inline button components
 */
function convertWekanInlineButtons(content: string): string {
  let result = content;
  
  // Reset lastIndex for the regex
  INLINE_BUTTON_FULL_REGEX.lastIndex = 0;
  
  // Find all matches first, then replace
  const matches: Array<{ full: string; style: string; inner: string }> = [];
  let match;
  while ((match = INLINE_BUTTON_FULL_REGEX.exec(content)) !== null) {
    matches.push({
      full: match[0],
      style: match[1],
      inner: match[2],
    });
  }
  
  // Process each match and replace
  for (const m of matches) {
    const buttonData = parseWekanInlineButton(m.full, m.style, m.inner);
    if (buttonData) {
      const serialized = serializeInlineButton(buttonData);
      result = result.replace(m.full, serialized);
    }
  }
  
  return result;
}

/**
 * Process card description: preserve markdown, convert inline buttons and emojis.
 * We do NOT convert to HTML here - the ToastUI editor handles markdown natively.
 * Preserves indentation and properly handles line/paragraph spacing.
 */
function processCardDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  
  // Convert emoji shortcodes and HTML entities to unicode emojis first
  let result = convertEmojiShortcodes(description);
  
  // Convert Wekan inline buttons to our format
  result = convertWekanInlineButtons(result);
  
  // Clean up excessive HTML that Wekan might have added while keeping markdown intact
  // Only strip the paragraph wrappers if the content doesn't have other HTML structure
  const hasComplexHtml = /<(h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*>/i.test(result);
  
  if (!hasComplexHtml) {
    // Convert paragraph tags to double newlines for proper paragraph spacing
    // Handle </p><p> transitions first to create paragraph breaks
    result = result.replace(/<\/p>\s*<p>/gi, '\n\n');
    // Remove remaining <p> and </p> tags
    result = result.replace(/<p[^>]*>/gi, '');
    result = result.replace(/<\/p>/gi, '\n\n');
    
    // Convert <br> and <br/> to single newlines
    result = result.replace(/<br\s*\/?>/gi, '\n');
    
    // Convert inline HTML formatting to markdown equivalents
    result = result.replace(/<strong>([^<]*)<\/strong>/gi, '**$1**');
    result = result.replace(/<b>([^<]*)<\/b>/gi, '**$1**');
    result = result.replace(/<em>([^<]*)<\/em>/gi, '*$1*');
    result = result.replace(/<i>([^<]*)<\/i>/gi, '*$1*');
    result = result.replace(/<code>([^<]*)<\/code>/gi, '`$1`');
    result = result.replace(/<s>([^<]*)<\/s>/gi, '~~$1~~');
    result = result.replace(/<strike>([^<]*)<\/strike>/gi, '~~$1~~');
    
    // Preserve indentation: convert &nbsp; sequences to spaces (4 spaces = 1 indent level)
    result = result.replace(/(&nbsp;){4}/gi, '    ');
    result = result.replace(/(&nbsp;){2}/gi, '  ');
    result = result.replace(/&nbsp;/gi, ' ');
    
    // Preserve tab characters for indentation
    result = result.replace(/\t/g, '    ');
    
    // Handle markdown list indentation - ensure proper spacing for nested lists
    // Lines starting with spaces followed by - or * or numbers should be preserved
    const lines = result.split('\n');
    const processedLines = lines.map(line => {
      // Count leading spaces/tabs to preserve indentation
      const leadingWhitespaceMatch = line.match(/^(\s*)/);
      const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[1] : '';
      const content = line.substring(leadingWhitespace.length);
      
      // If line starts with list markers, preserve the indentation
      if (/^[-*+]\s|^\d+\.\s/.test(content)) {
        return leadingWhitespace + content;
      }
      
      // For indented content (blockquotes, code blocks), preserve leading spaces
      if (leadingWhitespace.length > 0) {
        return leadingWhitespace + content;
      }
      
      return line;
    });
    result = processedLines.join('\n');
    
    // Normalize multiple newlines: max 2 consecutive newlines for paragraph breaks
    result = result.replace(/\n{3,}/g, '\n\n');
  } else {
    // For complex HTML, still preserve indentation markers
    result = result.replace(/(&nbsp;){4}/gi, '    ');
    result = result.replace(/(&nbsp;){2}/gi, '  ');
    result = result.replace(/&nbsp;/gi, ' ');
  }
  
  // Trim leading/trailing whitespace but preserve internal structure
  return result.trim() || null;
}

/**
 * Process card title: convert emoji shortcodes to unicode emojis.
 */
function processCardTitle(title: string): string {
  if (!title) return title;
  return convertEmojiShortcodes(title);
}

// Removed markdownToHtml function - we now store raw markdown, not HTML

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WekanLabel {
  _id: string;
  name: string;
  color: string;
}

interface WekanChecklistItem {
  _id: string;
  title: string;
  isFinished: boolean;
  sort?: number;
}

interface WekanChecklist {
  _id: string;
  cardId: string;
  title: string;
  items: WekanChecklistItem[];
  sort?: number;
}

interface WekanAttachment {
  _id: string;
  name: string;
  url?: string;
  type?: string;
  size?: number;
}

interface WekanCard {
  _id: string;
  title: string;
  description?: string;
  listId: string;
  labelIds?: string[];
  members?: string[];
  assignees?: string[];
  dueAt?: string;
  startAt?: string;
  createdAt?: string;
  modifiedAt?: string;
  sort?: number;
  archived?: boolean;
  color?: string; // Card background color
}

interface WekanList {
  _id: string;
  title: string;
  sort?: number;
  archived?: boolean;
}

interface WekanMember {
  _id: string;
  username?: string;
  fullname?: string;
}

interface WekanBoard {
  _id: string;
  title: string;
  description?: string;
  color?: string;
  labels?: WekanLabel[];
  lists?: WekanList[];
  cards?: WekanCard[];
  checklists?: WekanChecklist[];
  attachments?: WekanAttachment[];
  members?: WekanMember[];
  createdAt?: string;
  modifiedAt?: string;
}

// Map Wekan colors to hex colors - comprehensive list including all Wekan color names
const wekanColorMap: Record<string, string> = {
  // Standard colors
  green: '#61bd4f',
  yellow: '#f2d600',
  orange: '#ff9f1a',
  red: '#eb5a46',
  purple: '#c377e0',
  blue: '#0079bf',
  sky: '#00c2e0',
  lime: '#51e898',
  pink: '#ff78cb',
  black: '#344563',
  white: '#b3bac5',
  navy: '#026aa7',
  // Extended Wekan colors
  darkgreen: '#519839',
  darkblue: '#094c72',
  belize: '#2980b9',
  midnight: '#1a1a2e',
  peach: '#ffab91',
  crimson: '#dc143c',
  plum: '#8e4585',
  raspberry: '#e30b5c',
  teal: '#008080',
  aqua: '#00ffff',
  gold: '#ffd700',
  silver: '#c0c0c0',
  chartreuse: '#7fff00',
  pumpkin: '#ff7518',
  forest: '#228b22',
  indigo: '#4b0082',
  turquoise: '#40e0d0',
  coral: '#ff7f50',
  magenta: '#ff00ff',
  olive: '#808000',
  maroon: '#800000',
  bronze: '#cd7f32',
  brown: '#8b4513',
  grey: '#808080',
  gray: '#808080',
  slateblue: '#6a5acd',
  // Fallback
  default: '#838c91',
};

// Helper function to get color - handles hex values directly or maps named colors
function getWekanColor(color: string | undefined | null): string {
  if (!color) return wekanColorMap.default;
  // If it's already a hex color, use it directly
  if (color.startsWith('#')) return color;
  // Try to find in color map, otherwise use default
  return wekanColorMap[color.toLowerCase()] || wekanColorMap.default;
}

interface ProgressUpdate {
  type: 'progress';
  stage: string;
  current: number;
  total: number;
  detail?: string;
  createdIds?: {
    workspaceId?: string;
    boardIds?: string[];
  };
}

interface ImportResult {
  type: 'result';
  success: boolean;
  workspaces_created: number;
  boards_created: number;
  columns_created: number;
  cards_created: number;
  labels_created: number;
  subtasks_created: number;
  errors: string[];
  warnings: string[];
  createdIds?: {
    workspaceId?: string;
    boardIds?: string[];
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Check if streaming is requested
  const url = new URL(req.url);
  const useStreaming = url.searchParams.get('stream') === 'true';

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ type: 'result', success: false, errors: ['Missing authorization header'] }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract token
    const token = authHeader.replace('Bearer ', '');
    console.log('Token extracted, length:', token.length);

    // Create Supabase client with anon key first to verify the user token
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` }
        }
      }
    );

    // Get the user from the token
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser();
    
    console.log('Auth result - user:', user?.id, 'error:', authError?.message);
    
    if (authError || !user) {
      console.error('Auth failed:', authError?.message || 'No user found');
      return new Response(
        JSON.stringify({ type: 'result', success: false, errors: [`Invalid authorization: ${authError?.message || 'No user found'}`] }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create service role client for admin operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if user is app admin
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_app_admin', { _user_id: user.id });
    console.log('Is admin check:', isAdmin, 'error:', adminError?.message);
    
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ type: 'result', success: false, errors: ['Only app admins can import boards'] }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let wekanData: any;
    let defaultCardColor: string | null = null;
    
    try {
      const body = await req.json();
      wekanData = body.wekanData;
      defaultCardColor = body.defaultCardColor || null;
      console.log('Request body parsed, wekanData present:', !!wekanData, 'type:', typeof wekanData);
    } catch (parseError: any) {
      console.error('Failed to parse request body:', parseError.message);
      return new Response(
        JSON.stringify({ type: 'result', success: false, errors: ['Failed to parse request body: ' + parseError.message] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate Wekan data structure
    if (!wekanData) {
      console.error('No wekanData in request body');
      return new Response(
        JSON.stringify({ type: 'result', success: false, errors: ['No Wekan data provided'] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting Wekan import for user:', user.id);

    // If streaming is enabled, use SSE
    if (useStreaming) {
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          const sendProgress = (stage: string, current: number, total: number, detail?: string, createdIds?: { workspaceId?: string; boardIds?: string[] }) => {
            const data: ProgressUpdate = { type: 'progress', stage, current, total, detail, createdIds };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          const sendResult = (result: ImportResult) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
            controller.close();
          };

          try {
            await runImport(supabase, user.id, wekanData, defaultCardColor, sendProgress, sendResult);
          } catch (error: any) {
            console.error('Import error:', error);
            sendResult({
              type: 'result',
              success: false,
              errors: [error.message || 'An unexpected error occurred'],
              workspaces_created: 0,
              boards_created: 0,
              columns_created: 0,
              cards_created: 0,
              labels_created: 0,
              subtasks_created: 0,
              warnings: [],
            });
          }
        }
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming fallback
    const result = await runImportNonStreaming(supabase, user.id, wekanData, defaultCardColor);
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ 
        type: 'result',
        success: false, 
        errors: [error.message || 'An unexpected error occurred'],
        workspaces_created: 0,
        boards_created: 0,
        columns_created: 0,
        cards_created: 0,
        labels_created: 0,
        subtasks_created: 0,
        warnings: [],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function runImport(
  supabase: any,
  userId: string,
  wekanData: any,
  defaultCardColor: string | null,
  sendProgress: (stage: string, current: number, total: number, detail?: string, createdIds?: { workspaceId?: string; boardIds?: string[] }) => void,
  sendResult: (result: ImportResult) => void
) {
  // Track created IDs for potential rollback
  const createdIds: { workspaceId?: string; boardIds: string[] } = { boardIds: [] };

  const result: ImportResult = {
    type: 'result',
    success: true,
    workspaces_created: 0,
    boards_created: 0,
    columns_created: 0,
    cards_created: 0,
    labels_created: 0,
    subtasks_created: 0,
    errors: [],
    warnings: [],
  };

  sendProgress('parsing', 0, 0, 'Parsing Wekan data...');

  // Handle both single board and array of boards
  const boards: WekanBoard[] = Array.isArray(wekanData) ? wekanData : [wekanData];

  // Calculate totals for progress
  let totalLabels = 0;
  let totalLists = 0;
  let totalCards = 0;
  let totalChecklists = 0;

  for (const board of boards) {
    totalLabels += (board.labels || []).length;
    totalLists += (board.lists || []).filter(l => !l.archived).length;
    totalCards += (board.cards || []).filter(c => !c.archived).length;
    totalChecklists += (board.checklists || []).length;
  }

  sendProgress('workspace', 0, 1, 'Creating workspace...');

  // Create a workspace for the import
  const workspaceName = `Wekan Import ${new Date().toISOString().split('T')[0]}`;
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({
      name: workspaceName,
      description: `Imported from Wekan on ${new Date().toLocaleDateString()}`,
      owner_id: userId,
    })
    .select()
    .single();

  if (wsError) {
    console.error('Error creating workspace:', wsError);
    result.success = false;
    result.errors.push(`Failed to create workspace: ${wsError.message}`);
    sendResult(result);
    return;
  }

  result.workspaces_created = 1;
  createdIds.workspaceId = workspace.id;
  sendProgress('workspace', 1, 1, 'Workspace created', createdIds);
  console.log('Created workspace:', workspace.id);

  // Add user as workspace member
  await supabase.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: userId,
  });

  let processedLabels = 0;
  let processedLists = 0;
  let processedCards = 0;
  let processedChecklists = 0;

  // Process each board
  for (let boardIdx = 0; boardIdx < boards.length; boardIdx++) {
    const wekanBoard = boards[boardIdx];
    try {
      if (!wekanBoard.title) {
        result.warnings.push('Skipped board without title');
        continue;
      }

      sendProgress('board', boardIdx + 1, boards.length, `Creating board: ${wekanBoard.title}`);
      console.log('Processing board:', wekanBoard.title);

      // Determine board color
      const boardColor = getWekanColor(wekanBoard.color) || '#0079bf';

      // Create board
      const { data: board, error: boardError } = await supabase
        .from('boards')
        .insert({
          workspace_id: workspace.id,
          name: wekanBoard.title.substring(0, 100),
          description: wekanBoard.description?.substring(0, 1000) || null,
          background_color: boardColor,
        })
        .select()
        .single();

      if (boardError) {
        console.error('Error creating board:', boardError);
        result.errors.push(`Failed to create board "${wekanBoard.title}": ${boardError.message}`);
        continue;
      }

      result.boards_created++;
      createdIds.boardIds.push(board.id);
      
      // Send progress with created IDs for potential rollback
      sendProgress('board', boardIdx + 1, boards.length, `Created board: ${wekanBoard.title}`, createdIds);
      await supabase.from('board_members').insert({
        board_id: board.id,
        user_id: userId,
        role: 'admin',
      });

      // Map old IDs to new IDs
      const labelIdMap = new Map<string, string>();
      const columnIdMap = new Map<string, string>();
      const cardIdMap = new Map<string, string>();

      // Build member map for assignee names
      const memberMap = new Map<string, WekanMember>();
      for (const member of (wekanBoard.members || [])) {
        memberMap.set(member._id, member);
      }

      // Create labels
      const boardLabels = wekanBoard.labels || [];
      for (let labelIdx = 0; labelIdx < boardLabels.length; labelIdx++) {
        const wekanLabel = boardLabels[labelIdx];
        // Generate a name from the color if label has no name (common in Trello imports)
        const labelName = wekanLabel.name || wekanLabel.color || 'Unnamed';

        processedLabels++;
        sendProgress('labels', processedLabels, totalLabels, `Label: ${labelName}`);

        const labelColor = getWekanColor(wekanLabel.color);

        const { data: label, error: labelError } = await supabase
          .from('labels')
          .insert({
            board_id: board.id,
            name: labelName.substring(0, 50),
            color: labelColor,
          })
          .select()
          .single();

        if (labelError) {
          console.error('Error creating label:', labelError);
          result.warnings.push(`Failed to create label "${wekanLabel.name}"`);
          continue;
        }

        labelIdMap.set(wekanLabel._id, label.id);
        result.labels_created++;
      }

      // Create columns (lists)
      const lists = wekanBoard.lists || [];
      const sortedLists = [...lists]
        .filter(l => !l.archived)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0));

      for (let i = 0; i < sortedLists.length; i++) {
        const wekanList = sortedLists[i];
        if (!wekanList.title) continue;

        processedLists++;
        sendProgress('columns', processedLists, totalLists, `Column: ${wekanList.title}`);

        const { data: column, error: columnError } = await supabase
          .from('columns')
          .insert({
            board_id: board.id,
            title: wekanList.title.substring(0, 100),
            position: i,
          })
          .select()
          .single();

        if (columnError) {
          console.error('Error creating column:', columnError);
          result.warnings.push(`Failed to create column "${wekanList.title}"`);
          continue;
        }

        columnIdMap.set(wekanList._id, column.id);
        result.columns_created++;
      }

      // Create cards
      const cards = wekanBoard.cards || [];
      const sortedCards = [...cards]
        .filter(c => !c.archived)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0));

      // Group cards by list for proper positioning
      const cardsByList = new Map<string, WekanCard[]>();
      for (const card of sortedCards) {
        const listCards = cardsByList.get(card.listId) || [];
        listCards.push(card);
        cardsByList.set(card.listId, listCards);
      }

      for (const [listId, listCards] of cardsByList) {
        const columnId = columnIdMap.get(listId);
        if (!columnId) continue;

        for (let i = 0; i < listCards.length; i++) {
          const wekanCard = listCards[i];
          if (!wekanCard.title) continue;

          processedCards++;
          sendProgress('cards', processedCards, totalCards, `Card: ${wekanCard.title.substring(0, 30)}${wekanCard.title.length > 30 ? '...' : ''}`);

          // Parse due date if exists
          let dueDate = null;
          if (wekanCard.dueAt) {
            try {
              dueDate = new Date(wekanCard.dueAt).toISOString();
            } catch {
              // Invalid date, ignore
            }
          }

          // Determine card color using the helper function
          const cardColor = wekanCard.color ? getWekanColor(wekanCard.color) : null;

          // Use default color if card has no color assigned
          const finalCardColor = cardColor || defaultCardColor;

          // Process description: preserve markdown, convert Wekan inline buttons
          // ToastUI editor handles markdown natively
          const processedDescription = processCardDescription(wekanCard.description);
          
          // Process title: convert emoji shortcodes to unicode
          const processedTitle = processCardTitle(wekanCard.title);
          
          const { data: card, error: cardError } = await supabase
            .from('cards')
            .insert({
              column_id: columnId,
              title: processedTitle.substring(0, 200),
              description: processedDescription,
              position: i,
              due_date: dueDate,
              created_by: userId,
              priority: 'none',
              color: finalCardColor,
            })
            .select()
            .single();

          if (cardError) {
            console.error('Error creating card:', cardError);
            result.warnings.push(`Failed to create card "${processedTitle}"`);
            continue;
          }

          cardIdMap.set(wekanCard._id, card.id);
          result.cards_created++;

          // Add card labels
          if (wekanCard.labelIds && wekanCard.labelIds.length > 0) {
            for (const wekanLabelId of wekanCard.labelIds) {
              const labelId = labelIdMap.get(wekanLabelId);
              if (labelId) {
                await supabase
                  .from('card_labels')
                  .insert({ card_id: card.id, label_id: labelId })
                  .maybeSingle();
              }
            }
          }

        }
      }

      // Create subtasks from checklists
      const checklists = wekanBoard.checklists || [];
      for (const checklist of checklists) {
        const cardId = cardIdMap.get(checklist.cardId);
        if (!cardId) continue;

        processedChecklists++;
        sendProgress('subtasks', processedChecklists, totalChecklists, `Checklist: ${checklist.title || 'Untitled'}`);

        const items = checklist.items || [];
        const sortedItems = [...items].sort((a, b) => (a.sort || 0) - (b.sort || 0));

        for (let i = 0; i < sortedItems.length; i++) {
          const item = sortedItems[i];
          if (!item.title) continue;

          const { error: subtaskError } = await supabase
            .from('card_subtasks')
            .insert({
              card_id: cardId,
              title: item.title.substring(0, 200),
              completed: item.isFinished || false,
              position: i,
              checklist_name: checklist.title || 'Checklist',
            });

          if (subtaskError) {
            console.error('Error creating subtask:', subtaskError);
          } else {
            result.subtasks_created++;
          }
        }
      }


    } catch (boardError: any) {
      console.error('Error processing board:', boardError);
      result.errors.push(`Error processing board: ${boardError.message}`);
    }
  }

  sendProgress('complete', 100, 100, 'Import complete!');
  console.log('Import completed:', result);
  sendResult(result);
}

async function runImportNonStreaming(
  supabase: any,
  userId: string,
  wekanData: any,
  defaultCardColor: string | null
): Promise<ImportResult> {
  return new Promise((resolve) => {
    runImport(
      supabase,
      userId,
      wekanData,
      defaultCardColor,
      () => {}, // No-op progress
      (result) => resolve(result)
    );
  });
}
