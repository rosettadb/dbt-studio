import { useQuery, useMutation, useQueryClient } from 'react-query';
import * as skillsService from '../services/skills.service';

export const useGetSkills = () => useQuery(['skills'], skillsService.getSkills);

export const useGetSkillsDir = () =>
  useQuery(['skills', 'directory'], skillsService.getSkillsDir);

export const useDeleteSkill = () => {
  const qc = useQueryClient();
  return useMutation(skillsService.deleteSkill, {
    onSuccess: () => qc.invalidateQueries(['skills']),
  });
};

export const useCreateSkill = () => {
  const qc = useQueryClient();
  return useMutation(skillsService.createSkill, {
    onSuccess: () => qc.invalidateQueries(['skills']),
  });
};

export const useImportSkill = () => {
  const qc = useQueryClient();
  return useMutation(skillsService.importSkill, {
    onSuccess: () => qc.invalidateQueries(['skills']),
  });
};
