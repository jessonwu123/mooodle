import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function useQuestionBankAccess() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["question-bank-access", session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_edit_question_bank");
      if (error) throw error;
      return data === true;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return { canEdit: query.data === true, loading: query.isPending };
}