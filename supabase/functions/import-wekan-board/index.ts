import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

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
 * Serialize inline button data to the editable component HTML format
 */
function serializeInlineButton(data: InlineButtonData): string {
  const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return `<span class="editable-inline-button" data-inline-button="${encodedData}" contenteditable="false" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;background-color:${data.backgroundColor};border:1px solid #3d444d;white-space:nowrap;cursor:pointer;">${
    data.iconUrl ? `<img src="${data.iconUrl}" alt="" style="width:${data.iconSize}px;height:${data.iconSize}px;object-fit:contain;">` : ''
  }<a href="${data.linkUrl}" style="color:${data.textColor};text-decoration:none;" target="_blank" rel="noopener noreferrer">${data.linkText}</a></span>`;
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
 * Convert Markdown to basic HTML for card descriptions
 * Simple conversion without external dependencies
 */
function markdownToHtml(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  
  const trimmed = markdown.trim();
  
  // Check if content is already HTML
  if (trimmed.startsWith('<') && (
    trimmed.startsWith('<p>') || 
    trimmed.startsWith('<h') || 
    trimmed.startsWith('<ul>') || 
    trimmed.startsWith('<ol>') || 
    trimmed.startsWith('<div>') ||
    trimmed.startsWith('<blockquote>') ||
    trimmed.startsWith('<pre>')
  )) {
    // Even for already-HTML content, we need to process inline buttons
    return convertWekanInlineButtons(markdown);
  }
  
  try {
    let html = markdown;
    
    // Convert headers (must be done before other processing)
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    // Convert bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // Convert inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert code blocks
    html = html.replace(/```[\s\S]*?```/g, (match) => {
      const code = match.slice(3, -3).replace(/^\w+\n/, '');
      return `<pre><code>${code}</code></pre>`;
    });
    
    // Convert links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Convert unordered lists
    html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // Convert ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    
    // Convert blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    
    // Convert horizontal rules
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/^\*\*\*$/gm, '<hr>');
    
    // Convert Wekan color format: {color:red}text{color}
    html = html.replace(
      /\{color:([^}]+)\}([^{]*)\{color\}/g, 
      '<span style="color: $1">$2</span>'
    );
    
    // Split by double newlines for paragraphs, preserving single newlines as <br>
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      // Don't wrap block-level elements in paragraphs
      if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol') || 
          p.startsWith('<blockquote') || p.startsWith('<pre') || p.startsWith('<hr')) {
        return p;
      }
      // Preserve single line breaks as <br> within paragraphs
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
    
    // Convert Wekan inline buttons to editable components
    html = convertWekanInlineButtons(html);
    
    return html;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    // Fallback: preserve both paragraph breaks and line breaks
    return `<p>${markdown.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  }
}

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
  attachments_noted: number;
  attachments_pending: number;
  assignees_pending: number;
  errors: string[];
  warnings: string[];
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
          const sendProgress = (stage: string, current: number, total: number, detail?: string) => {
            const data: ProgressUpdate = { type: 'progress', stage, current, total, detail };
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
              attachments_noted: 0,
              attachments_pending: 0,
              assignees_pending: 0,
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
        attachments_noted: 0,
        attachments_pending: 0,
        assignees_pending: 0,
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
  sendProgress: (stage: string, current: number, total: number, detail?: string) => void,
  sendResult: (result: ImportResult) => void
) {
  const result: ImportResult = {
    type: 'result',
    success: true,
    workspaces_created: 0,
    boards_created: 0,
    columns_created: 0,
    cards_created: 0,
    labels_created: 0,
    subtasks_created: 0,
    attachments_noted: 0,
    attachments_pending: 0,
    assignees_pending: 0,
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
  let totalAttachments = 0;

  for (const board of boards) {
    totalLabels += (board.labels || []).length;
    totalLists += (board.lists || []).filter(l => !l.archived).length;
    totalCards += (board.cards || []).filter(c => !c.archived).length;
    totalChecklists += (board.checklists || []).length;
    totalAttachments += (board.attachments || []).length;
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
  sendProgress('workspace', 1, 1, 'Workspace created');
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
  let processedAttachments = 0;

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

      // Add user as board admin
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

          const { data: card, error: cardError } = await supabase
            .from('cards')
            .insert({
              column_id: columnId,
              title: wekanCard.title.substring(0, 200),
              description: markdownToHtml(wekanCard.description),
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
            result.warnings.push(`Failed to create card "${wekanCard.title}"`);
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

          // Create pending assignee mappings
          const allAssignees = [...(wekanCard.members || []), ...(wekanCard.assignees || [])];
          if (allAssignees.length > 0) {
            for (const memberId of allAssignees) {
              const member = memberMap.get(memberId);
              const memberName = member?.fullname || member?.username || `Unknown (${memberId})`;
              const username = member?.username || null;

              const { error: pendingError } = await supabase
                .from('import_pending_assignees')
                .insert({
                  board_id: board.id,
                  card_id: card.id,
                  original_member_id: memberId,
                  original_member_name: memberName,
                  original_username: username,
                  import_source: 'wekan',
                });

              if (!pendingError) {
                result.assignees_pending++;
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

      // Create pending attachment records for manual upload
      const attachments = wekanBoard.attachments || [];
      if (attachments.length > 0) {
        for (const attachment of attachments) {
          processedAttachments++;
          sendProgress('attachments', processedAttachments, totalAttachments, `Attachment: ${attachment.name || 'Unknown'}`);

          // Try to find the card for this attachment
          const cardId = cardIdMap.values().next().value; // Default to first card if no mapping
          
          if (cardId) {
            const { error: pendingAttachError } = await supabase
              .from('import_pending_attachments')
              .insert({
                board_id: board.id,
                card_id: cardId,
                original_attachment_id: attachment._id,
                original_name: attachment.name || 'Unknown',
                original_url: attachment.url || null,
                original_size: attachment.size || null,
                original_type: attachment.type || null,
                import_source: 'wekan',
              });

            if (!pendingAttachError) {
              result.attachments_pending++;
            }
          }
        }
        result.attachments_noted += attachments.length;
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
