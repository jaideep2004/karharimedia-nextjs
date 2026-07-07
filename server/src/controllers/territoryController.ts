import { Request, Response } from 'express';
import Territory from '../models/territory.model';

export const createTerritory = async (req: Request, res: Response) => {
  try {
    const territory = await Territory.create(req.body);
    res.status(201).json(territory);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
};

export const getTerritories = async (req: Request, res: Response) => {
  try {
    const filter: any = {};
    if (req.query.trackOrReleaseId) filter.trackOrReleaseId = req.query.trackOrReleaseId;
    if (req.query.type) filter.type = req.query.type;
    const territories = await Territory.find(filter);
    res.json(territories);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

export const updateTerritory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const territory = await Territory.findByIdAndUpdate(id, req.body, { new: true });
    if (!territory) return res.status(404).json({ error: 'Not found' });
    res.json(territory);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
};

export const deleteTerritory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const territory = await Territory.findByIdAndDelete(id);
    if (!territory) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// Validation endpoint (example: check if a country is allowed)
export const validateTerritory = async (req: Request, res: Response) => {
  try {
    const { trackOrReleaseId, type, country } = req.body;
    const territory = await Territory.findOne({ trackOrReleaseId, type });
    if (!territory) return res.status(404).json({ error: 'Not found' });
    const allowed = territory.allowed.includes(country) && !territory.disallowed.includes(country);
    res.json({ allowed });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
};
