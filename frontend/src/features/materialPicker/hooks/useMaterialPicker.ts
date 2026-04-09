import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { MaterialCategory } from '../../../types/materialCategory';

type CategoryType = 'CABLE' | 'EQUIPMENT' | 'ACCESSORY';

async function fetchByType(type: CategoryType): Promise<MaterialCategory[]> {
  const { data } = await api.get<MaterialCategory[]>(`/material-categories/by-type/${type}`);
  return data;
}

export interface UseMaterialPickerReturn {
  step: 'category' | 'spec';
  parentCategories: MaterialCategory[];
  childCategories: MaterialCategory[];
  selectedParent: MaterialCategory | null;
  selectedCategory: MaterialCategory | null;
  specValues: Record<string, unknown>;
  selectParent: (cat: MaterialCategory) => void;
  selectCategory: (cat: MaterialCategory) => void;
  updateSpecValues: (values: Record<string, unknown>) => void;
  goBack: () => void;
  confirm: () => void;
  isLoading: boolean;
  error: Error | null;
}

interface UseMaterialPickerOptions {
  categoryType: CategoryType;
  onSelect: (category: MaterialCategory, specValues: Record<string, unknown>) => void;
}

export function useMaterialPicker({
  categoryType,
  onSelect,
}: UseMaterialPickerOptions): UseMaterialPickerReturn {
  const [step, setStep] = useState<'category' | 'spec'>('category');
  const [selectedParent, setSelectedParent] = useState<MaterialCategory | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory | null>(null);
  const [specValues, setSpecValues] = useState<Record<string, unknown>>({});

  const { data: allCategories = [], isLoading, error } = useQuery({
    queryKey: ['materialCategories', categoryType],
    queryFn: () => fetchByType(categoryType),
  });

  const parentCategories = useMemo(
    () => allCategories.filter((c) => c.parentId === null && c.isActive),
    [allCategories],
  );

  const childCategories = useMemo(
    () =>
      selectedParent
        ? allCategories.filter((c) => c.parentId === selectedParent.id && c.isActive)
        : [],
    [allCategories, selectedParent],
  );

  const selectParent = useCallback((cat: MaterialCategory) => {
    setSelectedParent(cat);
    setSelectedCategory(null);
    setSpecValues({});
  }, []);

  const selectCategory = useCallback((cat: MaterialCategory) => {
    setSelectedCategory(cat);
    setSpecValues({});
    if (cat.specTemplate && cat.specTemplate.params.length > 0) {
      setStep('spec');
    }
  }, []);

  const updateSpecValues = useCallback((values: Record<string, unknown>) => {
    setSpecValues((prev) => ({ ...prev, ...values }));
  }, []);

  const goBack = useCallback(() => {
    if (step === 'spec') {
      setStep('category');
      setSelectedCategory(null);
      setSpecValues({});
    } else if (selectedParent) {
      setSelectedParent(null);
    }
  }, [step, selectedParent]);

  const confirm = useCallback(() => {
    if (selectedCategory) {
      onSelect(selectedCategory, specValues);
    }
  }, [selectedCategory, specValues, onSelect]);

  return {
    step,
    parentCategories,
    childCategories,
    selectedParent,
    selectedCategory,
    specValues,
    selectParent,
    selectCategory,
    updateSpecValues,
    goBack,
    confirm,
    isLoading,
    error: error as Error | null,
  };
}
