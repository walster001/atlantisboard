-- Add policy so users can always see their own board membership changes
-- This allows realtime DELETE events to be sent to the removed user
CREATE POLICY "Users can view their own board memberships"
ON public.board_members
FOR SELECT
USING (auth.uid() = user_id);