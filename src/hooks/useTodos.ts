import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Todo {
  id: string;
  repo_full_name: string;
  title: string;
  description: string;
  done: boolean;
  sort_order: number;
  created_at: string;
}

function queryKey(repo: string) {
  return ["todos", repo];
}

async function fetchTodos(repo: string): Promise<Todo[]> {
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("repo_full_name", repo)
    .order("sort_order")
    .order("created_at");

  if (error) throw error;
  return data as Todo[];
}

export function useTodos(repoFullName: string | null) {
  const queryClient = useQueryClient();
  const key = queryKey(repoFullName ?? "");

  const { data: todos = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetchTodos(repoFullName!),
    enabled: !!repoFullName,
  });

  const addMutation = useMutation({
    mutationFn: async (title: string) => {
      const maxOrder = todos.length > 0 ? Math.max(...todos.map((t) => t.sort_order)) + 1 : 0;
      const { error } = await supabase.from("todos").insert({
        repo_full_name: repoFullName,
        title,
        sort_order: maxOrder,
      });
      if (error) throw error;
    },
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Todo[]>(key);
      queryClient.setQueryData<Todo[]>(key, (old = []) => [
        ...old,
        {
          id: crypto.randomUUID(),
          repo_full_name: repoFullName!,
          title,
          description: "",
          done: false,
          sort_order: old.length,
          created_at: new Date().toISOString(),
        },
      ]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["todos", "pending-count"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("todos").update({ done }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Todo[]>(key);
      queryClient.setQueryData<Todo[]>(key, (old = []) =>
        old.map((t) => (t.id === id ? { ...t, done } : t))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["todos", "pending-count"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from("todos").update({ title }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Todo[]>(key);
      queryClient.setQueryData<Todo[]>(key, (old = []) =>
        old.map((t) => (t.id === id ? { ...t, title } : t))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["todos", "pending-count"] });
    },
  });

  const descriptionMutation = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) => {
      const { error } = await supabase.from("todos").update({ description }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, description }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Todo[]>(key);
      queryClient.setQueryData<Todo[]>(key, (old = []) =>
        old.map((t) => (t.id === id ? { ...t, description } : t))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("todos").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Todo[]>(key);
      queryClient.setQueryData<Todo[]>(key, (old = []) => old.filter((t) => t.id !== id));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["todos", "pending-count"] });
    },
  });

  const addTodo = useCallback((title: string) => addMutation.mutate(title), [addMutation]);
  const toggleTodo = useCallback(
    (id: string, done: boolean) => toggleMutation.mutate({ id, done }),
    [toggleMutation]
  );
  const updateTodo = useCallback(
    (id: string, title: string) => updateMutation.mutate({ id, title }),
    [updateMutation]
  );
  const updateDescription = useCallback(
    (id: string, description: string) => descriptionMutation.mutate({ id, description }),
    [descriptionMutation]
  );
  const deleteTodo = useCallback((id: string) => deleteMutation.mutate(id), [deleteMutation]);

  return { todos, isLoading, addTodo, toggleTodo, updateTodo, updateDescription, deleteTodo };
}
