import { zodResolver } from '@hookform/resolvers/zod';
import { UpdatePlatformTenantRequestSchema } from '@plataforma/shared';
import { useForm } from 'react-hook-form';
import { type z } from 'zod';

type UpdatePlatformTenantRequest = z.infer<typeof UpdatePlatformTenantRequestSchema>;

export function TenantEditForm({
  tenant,
  onSave,
  busy,
}: {
  tenant: UpdatePlatformTenantRequest;
  onSave: (value: UpdatePlatformTenantRequest) => Promise<void>;
  busy: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePlatformTenantRequest>({
    resolver: zodResolver(UpdatePlatformTenantRequestSchema),
    values: tenant,
  });
  return (
    <form
      className="platform-form"
      onSubmit={() => {
        void handleSubmit(onSave)();
      }}
    >
      <label>
        Razão social
        <input {...register('legalName')} />
      </label>
      <label>
        Nome comercial
        <input {...register('displayName')} />
      </label>
      <label>
        Slug
        <input {...register('slug')} />
      </label>
      <label>
        Timezone
        <input {...register('timezone')} />
      </label>
      <label>
        Locale
        <input {...register('locale')} />
      </label>
      <label>
        Moeda
        <input {...register('currency')} />
      </label>
      {Object.keys(errors).length > 0 && <p role="alert">Revise os campos informados.</p>}
      <button disabled={busy}>Salvar alterações</button>
    </form>
  );
}
