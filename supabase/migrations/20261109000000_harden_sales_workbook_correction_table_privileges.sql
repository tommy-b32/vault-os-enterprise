revoke all privileges on table
  public.vault_sales_workbook_order_corrections,
  public.vault_sales_workbook_order_correction_applications,
  public.vault_sales_workbook_operator_row_mappings
from service_role;

grant select, insert on table
  public.vault_sales_workbook_order_corrections,
  public.vault_sales_workbook_order_correction_applications,
  public.vault_sales_workbook_operator_row_mappings
to service_role;
