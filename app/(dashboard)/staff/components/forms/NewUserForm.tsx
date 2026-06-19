import React, { useState } from 'react';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { Stepper, Step, StepLabel, Button, Box, Alert, Popover } from '@mui/material';
import { FiMail, FiPhone, FiUser, FiLock } from 'react-icons/fi';
import DatePicker from 'react-multi-date-picker';
import { FiCalendar } from 'react-icons/fi';

export interface UserFormData {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  status: string;
  joinDate: string;
  username: string;
  password?: string;
  confirmPassword?: string;
  roleId: string;
}

interface UserFormProps {
  initialValues?: Partial<UserFormData>;
  onSubmit: (data: UserFormData) => void;
  loading?: boolean;
  error?: string | null;
  editMode?: boolean;
  successMessage?: string | null;
}

type RoleOption = { value: string; label: string }

const statusOptions = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
  { value: 'Suspended', label: 'Suspended' },
];

const steps = ['Bio Data', 'Roles Info', 'Login Details'];

const BioStep = ({ register, errors, control }: any) => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
            First Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-lg text-gray-400"/>
            <input
                id="firstName"
                type="text"
                placeholder="First Name"
                className={`w-full pl-10 pr-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none
                  ${errors.firstName 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-gray-300 hover:border-gray-400'
                  }`
                }
                {...register('firstName', {required: 'First name is required'})}
            />
          </div>
          {errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName.message}</p>}
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
            Last Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-lg text-gray-400"/>
            <input
                id="lastName"
                type="text"
                placeholder="Last Name"
                className={`w-full pl-10 pr-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none
                  ${errors.lastName 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-gray-300 hover:border-gray-400'
                  }`
                }
                {...register('lastName', {required: 'Last name is required'})}
            />
          </div>
          {errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName.message}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <FiMail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-lg text-gray-400"/>
          <input
              id="email"
              type="email"
              placeholder="Email"
              className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-md focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none transition-all duration-200 ${errors.email ? 'border-red-500' : 'border-gray-300 hover:border-gray-400'}`}
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Invalid email format',
                },
              })}
          />
        </div>
        {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
          Phone Number <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <FiPhone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-lg text-gray-400"/>
          <input
              id="phoneNumber"
              type="tel"
              placeholder="+256 7XX XXX XXX"
              className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-md focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none transition-all duration-200 ${errors.phoneNumber ? 'border-red-500' : 'border-gray-300 hover:border-gray-400'}`}
              {...register('phoneNumber', {required: 'Phone number is required'})}
          />
        </div>
        {errors.phoneNumber && <p className="mt-1 text-xs text-red-500">{errors.phoneNumber.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Status <span className="text-red-500">*</span>
          </label>
          <Controller
              name="status"
              control={control}
              rules={{ required: 'Status is required' }}
              render={({ field: { onChange, value } }) => {
                const [statusAnchor, setStatusAnchor] = React.useState<HTMLElement | null>(null)
                const statusOpen = Boolean(statusAnchor)
                const selectedLabel = statusOptions.find(o => o.value === value)?.label || ''

                return (
                  <>
                    <div
                        onClick={(e) => setStatusAnchor(e.currentTarget)}
                        className={`flex items-center justify-between w-full px-3 py-2.5 text-sm border rounded-md cursor-pointer transition-all duration-200 ${
                          statusOpen
                            ? 'ring-[1.5px] ring-[#f08c2b] border-transparent'
                            : errors.status
                              ? 'border-red-500'
                              : 'border-gray-300 hover:border-gray-400'
                        }`}
                    >
                      <span className={value ? 'text-gray-900' : 'text-gray-400'}>
                        {selectedLabel || 'Select status'}
                      </span>
                      <svg className={`h-4 w-4 text-gray-400 transition-transform ${statusOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <Popover
                        open={statusOpen}
                        anchorEl={statusAnchor}
                        onClose={() => setStatusAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                        PaperProps={{
                          sx: {
                            width: statusAnchor?.offsetWidth || 200,
                            borderRadius: '10px',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                            mt: 0.5,
                          },
                        }}
                    >
                      <div className="p-2">
                        {statusOptions.map((opt) => {
                          const isSelected = value === opt.value
                          return (
                            <div
                                key={opt.value}
                                onClick={() => { onChange(opt.value); setStatusAnchor(null) }}
                                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
                            >
                              <div className={`relative w-4.5 h-4.5 border-2 flex items-center justify-center rounded-md transition-all ${
                                isSelected ? 'bg-[#f08c2b] border-[#f08c2b]' : 'bg-white border-gray-400 hover:border-gray-600'
                              }`}>
                                {isSelected && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <span className="text-sm text-gray-800">{opt.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    </Popover>
                  </>
                )
              }}
          />
          {errors.status && <p className="mt-1 text-xs text-red-500">{errors.status.message}</p>}
        </div>
        <div>
          <label htmlFor="joinDate" className="block text-sm font-medium text-gray-700 mb-1">
            Joined Date <span className="text-red-500">*</span>
          </label>
          <Controller
              name="joinDate"
              control={control}
              rules={{ required: 'Joined date is required' }}
              render={({ field: { onChange, value } }) => {
                const [dateOpen, setDateOpen] = React.useState(false)
                const displayDate = value
                  ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : ''
                return (
                  <div className="w-full">
                    <DatePicker
                        className="orange"
                        value={value ? new Date(value) : null}
                        onOpenPickNewDate={false}
                        onOpen={() => setDateOpen(true)}
                        onClose={() => setDateOpen(false)}
                        onChange={(dateObj) => {
                          if (dateObj) {
                            const d = (dateObj as any)?.toDate?.()
                            onChange(d ? d.toISOString().slice(0, 10) : '')
                          } else {
                            onChange('')
                          }
                        }}
                        format="DD/MM/YYYY"
                        containerStyle={{ width: '100%' }}
                        render={(_pickerValue, openCalendar) => (
                          <div
                              onClick={openCalendar}
                              className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm border rounded-md cursor-pointer transition-all duration-200 ${
                                dateOpen
                                  ? 'ring-[1.5px] ring-[#f08c2b] border-transparent'
                                  : errors.joinDate
                                    ? 'border-red-500'
                                    : 'border-gray-300 hover:border-gray-400'
                              }`}
                          >
                            <FiCalendar className="text-gray-400" />
                            <span className={displayDate ? 'text-gray-900' : 'text-gray-400'}>
                              {displayDate || 'Select date'}
                            </span>
                          </div>
                        )}
                    />
                  </div>
                )
              }}
          />
          {errors.joinDate && <p className="mt-1 text-xs text-red-500">{errors.joinDate.message}</p>}
        </div>
      </div>
    </div>
);

const RolesStep = ({control, errors, roleOptions, roleOptionsLoading}: any) => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Role <span className="text-red-500">*</span>
        </label>
        {roleOptionsLoading ? (
          <div className="text-sm text-gray-500 py-2">Loading roles...</div>
        ) : roleOptions.length === 0 ? (
          <div className="text-sm text-red-600 py-2">No roles available in role catalog</div>
        ) : (
          <Controller
            name="roleId"
            control={control}
            rules={{ required: "A role is required" }}
            render={({ field: { value = "", onChange } }) => (
                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {roleOptions.map((role: RoleOption) => (
                    <label
                      key={role.value}
                      className="flex items-center space-x-2 px-3 py-2.5 border rounded-md cursor-pointer border-gray-300 hover:border-gray-400 transition-all duration-200"
                    >
                      <input
                        type="radio"
                        name="staff-role"
                        checked={value === role.value}
                        onChange={() => onChange(role.value)}
                        className="text-[#f08c2b] accent-[#f08c2b] focus:ring-[#f08c2b]"
                      />
                      <span className="text-sm text-gray-700">{role.label}</span>
                    </label>
                  ))}
                </div>
            )}
          />
        )}
        {errors.roleId && <p className="mt-1 text-xs text-red-500">{errors.roleId.message}</p>}
      </div>
    </div>
);

const LoginStep = ({register, errors, watch, editMode}: any) => (
    <div className="space-y-6">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
          Username <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-lg text-gray-400"/>
          <input
              id="username"
              type="text"
              placeholder="Username"
              className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-md focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none transition-all duration-200 ${errors.username ? 'border-red-500' : 'border-gray-300 hover:border-gray-400'}`}
              {...register('username', {required: 'Username is required'})}
          />
        </div>
        {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username.message}</p>}
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          {editMode ? 'New Password' : 'Password'} {!editMode && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
          <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-lg text-gray-400" />
          <input
              id="password"
              type="password"
              placeholder={editMode ? "Enter new password (leave blank to keep current)" : "Password"}
              className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-md focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none transition-all duration-200 ${errors.password ? 'border-red-500' : 'border-gray-300 hover:border-gray-400'}`}
              {...register('password', {
                required: !editMode ? 'Password is required' : false,
                minLength: { value: 8, message: 'Password must be at least 8 characters' },
                validate: (value: string | undefined) => {
                  if (editMode && value && value.length > 0 && value.length < 8) {
                    return 'Password must be at least 8 characters';
                  }
                  return true;
                }
              })}
          />
        </div>
        {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
          {editMode ? 'Confirm New Password' : 'Confirm Password'} {!editMode && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
          <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-lg text-gray-400" />
          <input
              id="confirmPassword"
              type="password"
              placeholder={editMode ? "Confirm new password" : "Confirm Password"}
              className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-md focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none transition-all duration-200 ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300 hover:border-gray-400'}`}
              {...register('confirmPassword', {
                required: !editMode ? 'Please confirm your password' : false,
                validate: (value: string | undefined) => {
                  const password = watch('password');
                  if (editMode && password && value !== password) {
                    return 'Passwords do not match';
                  }
                  if (!editMode && value !== password) {
                    return 'Passwords do not match';
                  }
                  return true;
                }
              })}
          />
        </div>
        {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>}
      </div>
    </div>
);

const UserForm: React.FC<UserFormProps> = ({
  initialValues = {},
  onSubmit,
  loading = false,
  error = null,
  editMode = false,
  successMessage = null,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [showValidation, setShowValidation] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [roleOptionsLoading, setRoleOptionsLoading] = useState(false)

  const methods = useForm<UserFormData>({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      status: 'Active',
      joinDate: '',
      username: '',
      password: '',
      confirmPassword: '',
      roleId: '',
      ...initialValues,
    },
    mode: 'onTouched',
  });

  const { register, handleSubmit, formState: { errors }, trigger, watch, reset, control, clearErrors } = methods;

  React.useEffect(() => {
    let cancelled = false
    async function loadRoleOptions() {
      setRoleOptionsLoading(true)
      try {
        const res = await fetch("/api/institution/staff/roles", { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || "Failed to load roles")
        if (!cancelled) {
          const options = Array.isArray(body.roles) ? body.roles : []
          setRoleOptions(options)
        }
      } catch {
        if (!cancelled) setRoleOptions([])
      } finally {
        if (!cancelled) setRoleOptionsLoading(false)
      }
    }
    loadRoleOptions()
    return () => {
      cancelled = true
    }
  }, [])

  const getStepFields = (step: number): (keyof UserFormData)[] => {
    switch (step) {
      case 0: return ['firstName', 'lastName', 'email', 'phoneNumber', 'status', 'joinDate'];
      case 1: return ['roleId'];
      case 2: return ['username', 'password', 'confirmPassword'];
      default: return [];
    }
  };

  const validateStep = async (step: number): Promise<boolean> => {
    const fields = getStepFields(step);
    if (fields.length === 0) return true;
    const isValid = await trigger(fields);
    setShowValidation(!isValid);
    return isValid;
  };

  const hasStepErrors = (step: number): boolean => {
    if (!showValidation) return false;
    const fields = getStepFields(step);
    return fields.some((field) => errors[field]);
  };

  const handleNext = async () => {
    if (await validateStep(activeStep)) {
      const nextStep = activeStep + 1;
      clearErrors(getStepFields(nextStep));
      setActiveStep(nextStep);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleFormSubmit = async (data: UserFormData) => {
    if (activeStep !== steps.length - 1) return;
    if (!(await validateStep(activeStep))) return;
    onSubmit(data);
    setIsSubmitted(true);
  };

  return (
    <div className="bg-white p-8 rounded-xl shadow-md max-w-2xl mx-auto">
      {isSubmitted && successMessage && (
        <Alert severity="success" sx={{ mb: 6 }}>{successMessage}</Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 6 }}>{error}</Alert>
      )}
      <FormProvider {...methods}>
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          <Stepper
            activeStep={activeStep}
            alternativeLabel
            className="mb-8"
            sx={{
              '& .MuiStepIcon-root.Mui-active': { color: '#f08c2b' },
              '& .MuiStepIcon-root.Mui-completed': { color: '#f08c2b' },
              '& .MuiStepConnector-line': { borderColor: '#e5e7eb' },
              '& .Mui-active .MuiStepConnector-line': { borderColor: '#f08c2b' },
              '& .Mui-completed .MuiStepConnector-line': { borderColor: '#f08c2b' },
            }}
          >
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
          <Box sx={{ mt: 2, mb: 1 }}>
            {activeStep === 0 && <BioStep register={register} errors={errors} control={control} />}
            {activeStep === 1 && <RolesStep control={control} errors={errors} roleOptions={roleOptions} roleOptionsLoading={roleOptionsLoading} />}
            {activeStep === 2 && <LoginStep register={register} errors={errors} watch={watch} editMode={editMode} />}
            {activeStep === steps.length && (
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Review and Submit</h3>
                <p className="text-sm text-gray-600">Please review your information before submitting.</p>
              </div>
            )}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 6 }}>
            <Button
              disabled={activeStep === 0 || loading}
              onClick={handleBack}
              variant="outlined"
              sx={{
                borderColor: '#777',
                color: '#000',
                textTransform: 'none',
                px: 4,
                py: 1,
                '&:hover': {
                  borderColor: '#f08c2b',
                  backgroundColor: 'transparent',
                  color: '#000',
                },
              }}
            >
              Back
            </Button>
            <Box>
              {activeStep === steps.length - 1 ? (
                <Button
                  variant="contained"
                  type="button"
                  onClick={handleSubmit(handleFormSubmit)}
                  disabled={loading}
                  sx={{ backgroundColor: '#f08c2b', textTransform: 'none', px: 4, py: 1 }}
                >
                  {loading ? 'Saving...' : (editMode ? 'Save Changes' : 'Create System User')}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  type="button"
                  onClick={handleNext}
                  disabled={loading || hasStepErrors(activeStep)}
                  sx={{
                    backgroundColor: '#000',
                    color: '#fff',
                    textTransform: 'none',
                    px: 4,
                    py: 1,
                    boxShadow: 'none',
                    '&:hover': {
                      backgroundColor: '#f08c2b',
                      boxShadow: 'none',
                    },
                  }}
                >
                  Next
                </Button>
              )}
            </Box>
          </Box>
        </form>
      </FormProvider>
    </div>
  );
};

export default UserForm;