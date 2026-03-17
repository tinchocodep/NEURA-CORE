-- Function to deactivate other active messaging connections for the same external_id
CREATE OR REPLACE FUNCTION deactivate_other_messaging_connections(
    p_external_id text,
    p_provider text,
    p_exclude_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE messaging_connections
    SET status = 'inactive'
    WHERE external_id = p_external_id
      AND provider = p_provider
      AND id != p_exclude_id
      AND status = 'active';
END;
$$;
