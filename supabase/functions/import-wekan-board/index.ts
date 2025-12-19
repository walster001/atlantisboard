import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

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
    return markdown;
  }
  
  try {
    let html = markdown;
    
    // Convert headers
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
    
    // Convert line breaks to paragraphs
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol') || 
          p.startsWith('<blockquote') || p.startsWith('<pre') || p.startsWith('<hr')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
    
    // Convert Wekan color format: {color:red}text{color}
    html = html.replace(
      /\{color:([^}]+)\}([^{]*)\{color\}/g, 
      '<span style="color: $1">$2</span>'
    );
    
    return html;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    return `<p>${markdown.replace(/\n/g, '<br>')}</p>`;
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

// Map Wekan colors to hex colors
const wekanColorMap: Record<string, string> = {
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
  darkgreen: '#519839',
  darkblue: '#094c72',
  belize: '#2980b9',
  default: '#838c91',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, errors: ['Missing authorization header'] }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify user is app admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, errors: ['Invalid authorization'] }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is app admin
    const { data: isAdmin } = await supabase.rpc('is_app_admin', { _user_id: user.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, errors: ['Only app admins can import boards'] }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { wekanData } = await req.json();

    // Validate Wekan data structure
    if (!wekanData) {
      return new Response(
        JSON.stringify({ success: false, errors: ['No Wekan data provided'] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting Wekan import for user:', user.id);

    const result = {
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
      errors: [] as string[],
      warnings: [] as string[],
    };

    // Handle both single board and array of boards
    const boards: WekanBoard[] = Array.isArray(wekanData) ? wekanData : [wekanData];

    // Create a workspace for the import
    const workspaceName = `Wekan Import ${new Date().toISOString().split('T')[0]}`;
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({
        name: workspaceName,
        description: `Imported from Wekan on ${new Date().toLocaleDateString()}`,
        owner_id: user.id,
      })
      .select()
      .single();

    if (wsError) {
      console.error('Error creating workspace:', wsError);
      return new Response(
        JSON.stringify({ success: false, errors: [`Failed to create workspace: ${wsError.message}`] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    result.workspaces_created = 1;
    console.log('Created workspace:', workspace.id);

    // Add user as workspace member
    await supabase.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: user.id,
    });

    // Process each board
    for (const wekanBoard of boards) {
      try {
        if (!wekanBoard.title) {
          result.warnings.push('Skipped board without title');
          continue;
        }

        console.log('Processing board:', wekanBoard.title);

        // Determine board color
        let boardColor = '#0079bf';
        if (wekanBoard.color && wekanColorMap[wekanBoard.color]) {
          boardColor = wekanColorMap[wekanBoard.color];
        }

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
          user_id: user.id,
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
        if (wekanBoard.labels && wekanBoard.labels.length > 0) {
          for (const wekanLabel of wekanBoard.labels) {
            if (!wekanLabel.name) continue;

            const labelColor = wekanColorMap[wekanLabel.color] || wekanColorMap.default;

            const { data: label, error: labelError } = await supabase
              .from('labels')
              .insert({
                board_id: board.id,
                name: wekanLabel.name.substring(0, 50),
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
        }

        // Create columns (lists)
        const lists = wekanBoard.lists || [];
        const sortedLists = [...lists]
          .filter(l => !l.archived)
          .sort((a, b) => (a.sort || 0) - (b.sort || 0));

        for (let i = 0; i < sortedLists.length; i++) {
          const wekanList = sortedLists[i];
          if (!wekanList.title) continue;

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

            // Parse due date if exists
            let dueDate = null;
            if (wekanCard.dueAt) {
              try {
                dueDate = new Date(wekanCard.dueAt).toISOString();
              } catch {
                // Invalid date, ignore
              }
            }

            const { data: card, error: cardError } = await supabase
              .from('cards')
              .insert({
                column_id: columnId,
                title: wekanCard.title.substring(0, 200),
                description: markdownToHtml(wekanCard.description),
                position: i,
                due_date: dueDate,
                created_by: user.id,
                priority: 'none',
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
            // Find which card this attachment belongs to based on the attachment's cardId if available
            // Wekan attachments may have a cardId or we need to match by URL patterns
            // For now, track all attachments at board level for manual assignment
            
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

    console.log('Import completed:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ 
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
