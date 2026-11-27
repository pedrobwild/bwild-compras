export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      clientes_obras: {
        Row: {
          contato: string | null
          created_at: string
          criado_por: string | null
          email: string | null
          empreendimento: string | null
          endereco: string | null
          id: string
          nome: string
          observacao: string | null
          telefone: string | null
          unidade: string | null
          updated_at: string
        }
        Insert: {
          contato?: string | null
          created_at?: string
          criado_por?: string | null
          email?: string | null
          empreendimento?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacao?: string | null
          telefone?: string | null
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          contato?: string | null
          created_at?: string
          criado_por?: string | null
          email?: string | null
          empreendimento?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          telefone?: string | null
          unidade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      compras: {
        Row: {
          created_at: string
          data_compra: string
          data_entrega_real: string | null
          descricao_itens: string | null
          endereco_entrega: string | null
          forma_pagamento: string | null
          fornecedor: string
          fornecedor_contato: string | null
          id: string
          local_entrega: string
          numero_pedido: string | null
          observacao: string | null
          previsao_entrega: string | null
          recebido_por: string | null
          registrado_por: string
          solicitacao_id: string
          updated_at: string
          valor_total: number
        }
        Insert: {
          created_at?: string
          data_compra?: string
          data_entrega_real?: string | null
          descricao_itens?: string | null
          endereco_entrega?: string | null
          forma_pagamento?: string | null
          fornecedor: string
          fornecedor_contato?: string | null
          id?: string
          local_entrega?: string
          numero_pedido?: string | null
          observacao?: string | null
          previsao_entrega?: string | null
          recebido_por?: string | null
          registrado_por?: string
          solicitacao_id: string
          updated_at?: string
          valor_total: number
        }
        Update: {
          created_at?: string
          data_compra?: string
          data_entrega_real?: string | null
          descricao_itens?: string | null
          endereco_entrega?: string | null
          forma_pagamento?: string | null
          fornecedor?: string
          fornecedor_contato?: string | null
          id?: string
          local_entrega?: string
          numero_pedido?: string | null
          observacao?: string | null
          previsao_entrega?: string | null
          recebido_por?: string | null
          registrado_por?: string
          solicitacao_id?: string
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "painel_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_anexos: {
        Row: {
          cotacao_id: string
          created_at: string
          enviado_por: string
          id: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes: number | null
          tipo_mime: string | null
        }
        Insert: {
          cotacao_id: string
          created_at?: string
          enviado_por?: string
          id?: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes?: number | null
          tipo_mime?: string | null
        }
        Update: {
          cotacao_id?: string
          created_at?: string
          enviado_por?: string
          id?: string
          nome_arquivo?: string
          storage_path?: string
          tamanho_bytes?: number | null
          tipo_mime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_anexos_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacoes: {
        Row: {
          comentario: string | null
          condicao_pagamento: string | null
          created_at: string
          criado_por: string | null
          escolhida: boolean
          fornecedor: string
          fornecedor_contato: string | null
          id: string
          prazo_entrega_dias: number | null
          solicitacao_id: string
          updated_at: string
          validade: string | null
          valor_total: number | null
        }
        Insert: {
          comentario?: string | null
          condicao_pagamento?: string | null
          created_at?: string
          criado_por?: string | null
          escolhida?: boolean
          fornecedor: string
          fornecedor_contato?: string | null
          id?: string
          prazo_entrega_dias?: number | null
          solicitacao_id: string
          updated_at?: string
          validade?: string | null
          valor_total?: number | null
        }
        Update: {
          comentario?: string | null
          condicao_pagamento?: string | null
          created_at?: string
          criado_por?: string | null
          escolhida?: boolean
          fornecedor?: string
          fornecedor_contato?: string | null
          id?: string
          prazo_entrega_dias?: number | null
          solicitacao_id?: string
          updated_at?: string
          validade?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacoes_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "painel_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacoes_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      extracoes_projeto: {
        Row: {
          caracteres: number | null
          created_at: string
          duracao_ms: number | null
          erro: string | null
          id: string
          modelo: string | null
          nome_arquivo: string | null
          paginas: number | null
          resultado: Json | null
          solicitacao_id: string | null
          status: string
          tokens_entrada: number | null
          tokens_saida: number | null
          usuario_id: string
        }
        Insert: {
          caracteres?: number | null
          created_at?: string
          duracao_ms?: number | null
          erro?: string | null
          id?: string
          modelo?: string | null
          nome_arquivo?: string | null
          paginas?: number | null
          resultado?: Json | null
          solicitacao_id?: string | null
          status?: string
          tokens_entrada?: number | null
          tokens_saida?: number | null
          usuario_id?: string
        }
        Update: {
          caracteres?: number | null
          created_at?: string
          duracao_ms?: number | null
          erro?: string | null
          id?: string
          modelo?: string | null
          nome_arquivo?: string | null
          paginas?: number | null
          resultado?: Json | null
          solicitacao_id?: string | null
          status?: string
          tokens_entrada?: number | null
          tokens_saida?: number | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracoes_projeto_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "painel_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracoes_projeto_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nome?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      solicitacao_anexos: {
        Row: {
          created_at: string
          enviado_por: string
          finalidade: string
          id: string
          nome_arquivo: string
          pagamento_id: string | null
          solicitacao_id: string
          storage_path: string
          tamanho_bytes: number | null
          tipo_mime: string | null
        }
        Insert: {
          created_at?: string
          enviado_por?: string
          finalidade?: string
          id?: string
          nome_arquivo: string
          pagamento_id?: string | null
          solicitacao_id: string
          storage_path: string
          tamanho_bytes?: number | null
          tipo_mime?: string | null
        }
        Update: {
          created_at?: string
          enviado_por?: string
          finalidade?: string
          id?: string
          nome_arquivo?: string
          pagamento_id?: string | null
          solicitacao_id?: string
          storage_path?: string
          tamanho_bytes?: number | null
          tipo_mime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anexos_pagamento_fk"
            columns: ["pagamento_id", "solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacao_pagamentos"
            referencedColumns: ["id", "solicitacao_id"]
          },
          {
            foreignKeyName: "solicitacao_anexos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "painel_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_anexos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacao_eventos: {
        Row: {
          created_at: string
          descricao: string
          id: string
          solicitacao_id: string
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          solicitacao_id: string
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          solicitacao_id?: string
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacao_eventos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "painel_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_eventos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacao_itens: {
        Row: {
          ambiente: string | null
          categoria: string | null
          created_at: string
          descricao: string
          especificacao: string | null
          id: string
          link_referencia: string | null
          observacao: string | null
          origem: string
          pagamento_id: string | null
          quantidade: number
          referencia_projeto: string | null
          solicitacao_id: string
          unidade: string
        }
        Insert: {
          ambiente?: string | null
          categoria?: string | null
          created_at?: string
          descricao: string
          especificacao?: string | null
          id?: string
          link_referencia?: string | null
          observacao?: string | null
          origem?: string
          pagamento_id?: string | null
          quantidade?: number
          referencia_projeto?: string | null
          solicitacao_id: string
          unidade?: string
        }
        Update: {
          ambiente?: string | null
          categoria?: string | null
          created_at?: string
          descricao?: string
          especificacao?: string | null
          id?: string
          link_referencia?: string | null
          observacao?: string | null
          origem?: string
          pagamento_id?: string | null
          quantidade?: number
          referencia_projeto?: string | null
          solicitacao_id?: string
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_pagamento_fk"
            columns: ["pagamento_id", "solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacao_pagamentos"
            referencedColumns: ["id", "solicitacao_id"]
          },
          {
            foreignKeyName: "solicitacao_itens_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "painel_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_itens_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacao_pagamentos: {
        Row: {
          codigo: string | null
          created_at: string
          criado_por: string | null
          id: string
          legado: boolean
          link: string | null
          observacao: string | null
          onde_comprado: string
          solicitacao_id: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          legado?: boolean
          link?: string | null
          observacao?: string | null
          onde_comprado: string
          solicitacao_id: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          codigo?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          legado?: boolean
          link?: string | null
          observacao?: string | null
          onde_comprado?: string
          solicitacao_id?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacao_pagamentos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "painel_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_pagamentos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes: {
        Row: {
          area_m2: number | null
          cliente: string
          codigo: string | null
          created_at: string
          data_necessaria: string | null
          descricao: string | null
          empreendimento: string | null
          endereco_obra: string | null
          extracao_id: string | null
          fornecedor_previsto: string | null
          id: string
          local_entrega_previsto: string | null
          motivo_cancelamento: string | null
          numero: number
          pagamento_instrucoes: string | null
          pagamento_link: string | null
          prazo_compra: string | null
          prazo_fornecedor_dias: number | null
          prazo_obra: string | null
          prioridade: Database["public"]["Enums"]["prioridade_solicitacao"]
          responsavel_compras_id: string | null
          solicitante_id: string
          status: Database["public"]["Enums"]["status_solicitacao"]
          titulo: string
          unidade: string | null
          updated_at: string
          valor_estimado: number | null
        }
        Insert: {
          area_m2?: number | null
          cliente: string
          codigo?: string | null
          created_at?: string
          data_necessaria?: string | null
          descricao?: string | null
          empreendimento?: string | null
          endereco_obra?: string | null
          extracao_id?: string | null
          fornecedor_previsto?: string | null
          id?: string
          local_entrega_previsto?: string | null
          motivo_cancelamento?: string | null
          numero?: never
          pagamento_instrucoes?: string | null
          pagamento_link?: string | null
          prazo_compra?: string | null
          prazo_fornecedor_dias?: number | null
          prazo_obra?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_solicitacao"]
          responsavel_compras_id?: string | null
          solicitante_id?: string
          status?: Database["public"]["Enums"]["status_solicitacao"]
          titulo: string
          unidade?: string | null
          updated_at?: string
          valor_estimado?: number | null
        }
        Update: {
          area_m2?: number | null
          cliente?: string
          codigo?: string | null
          created_at?: string
          data_necessaria?: string | null
          descricao?: string | null
          empreendimento?: string | null
          endereco_obra?: string | null
          extracao_id?: string | null
          fornecedor_previsto?: string | null
          id?: string
          local_entrega_previsto?: string | null
          motivo_cancelamento?: string | null
          numero?: never
          pagamento_instrucoes?: string | null
          pagamento_link?: string | null
          prazo_compra?: string | null
          prazo_fornecedor_dias?: number | null
          prazo_obra?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_solicitacao"]
          responsavel_compras_id?: string | null
          solicitante_id?: string
          status?: Database["public"]["Enums"]["status_solicitacao"]
          titulo?: string
          unidade?: string | null
          updated_at?: string
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_extracao_fk"
            columns: ["extracao_id"]
            isOneToOne: false
            referencedRelation: "extracoes_projeto"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      painel_solicitacoes: {
        Row: {
          atrasada: boolean | null
          cliente: string | null
          codigo: string | null
          cotacao_prazo_dias: number | null
          created_at: string | null
          custo_total: number | null
          data_compra_min: string | null
          data_necessaria: string | null
          dias_atraso: number | null
          dias_atraso_chegada: number | null
          dias_atraso_compra: number | null
          dias_atraso_entrega: number | null
          empreendimento: string | null
          fornecedor_exibicao: string | null
          fornecedor_origem: string | null
          fornecedor_previsto: string | null
          fornecedores: string | null
          id: string | null
          locais_entrega: string | null
          local_entrega_previsto: string | null
          local_exibicao: string | null
          local_origem: string | null
          numero: number | null
          prazo_compra: string | null
          prazo_fornecedor_dias: number | null
          previsao_exibicao: string | null
          previsao_origem: string | null
          prioridade:
            | Database["public"]["Enums"]["prioridade_solicitacao"]
            | null
          proxima_entrega: string | null
          qtd_anexos: number | null
          qtd_compras: number | null
          qtd_itens: number | null
          responsavel_compras_id: string | null
          responsavel_nome: string | null
          situacao_prazo: string | null
          solicitante_id: string | null
          solicitante_nome: string | null
          status: Database["public"]["Enums"]["status_solicitacao"] | null
          tipo_atraso: string | null
          titulo: string | null
          unidade: string | null
          updated_at: string | null
          valor_estimado: number | null
          valor_exibicao: number | null
          valor_origem: string | null
          vence_em_dias: number | null
          via_projeto_executivo: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      brl: { Args: { v: number }; Returns: string }
      dias_atraso_entrega: {
        Args: { c: Database["public"]["Tables"]["compras"]["Row"] }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hoje_sp: { Args: never; Returns: string }
      is_compras: { Args: { _user_id: string }; Returns: boolean }
      label_status: {
        Args: { s: Database["public"]["Enums"]["status_solicitacao"] }
        Returns: string
      }
      salvar_pagamento: {
        Args: {
          p_instrucoes: string
          p_link: string
          p_remover_anexos?: string[]
          p_solicitacao_id: string
          p_solicitar?: boolean
        }
        Returns: undefined
      }
      salvar_pagamentos: {
        Args: {
          p_pagamentos: Json
          p_solicitacao_id: string
          p_solicitar: boolean
          p_versao: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "solicitante" | "compras" | "admin"
      prioridade_solicitacao: "baixa" | "normal" | "urgente"
      status_solicitacao:
        | "nova"
        | "cronograma_confirmado"
        | "em_cotacao"
        | "aguardando_aprovacao"
        | "aprovada"
        | "solicitacao_pagamento"
        | "comprada"
        | "entregue_parcial"
        | "entregue"
        | "cancelada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["solicitante", "compras", "admin"],
      prioridade_solicitacao: ["baixa", "normal", "urgente"],
      status_solicitacao: [
        "nova",
        "cronograma_confirmado",
        "em_cotacao",
        "aguardando_aprovacao",
        "aprovada",
        "solicitacao_pagamento",
        "comprada",
        "entregue_parcial",
        "entregue",
        "cancelada",
      ],
    },
  },
} as const
