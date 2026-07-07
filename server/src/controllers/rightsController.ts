import { Request, Response } from 'express';
import Rights from '../models/rights.model';

export const createRights = async (req: Request, res: Response) => {
  try {
    const rights = await Rights.create(req.body);
    res.status(201).json(rights);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
};

export const getRights = async (req: Request, res: Response) => {
  try {
    const filter: any = {};
    if (req.query.trackOrReleaseId) filter.trackOrReleaseId = req.query.trackOrReleaseId;
    if (req.query.type) filter.type = req.query.type;
    const rights = await Rights.find(filter);
    res.json(rights);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

export const updateRights = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rights = await Rights.findByIdAndUpdate(id, req.body, { new: true });
    if (!rights) return res.status(404).json({ error: 'Not found' });
    res.json(rights);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
};

export const deleteRights = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rights = await Rights.findByIdAndDelete(id);
    if (!rights) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// Validation endpoint (example: check if rights are exclusive)
export const validateRights = async (req: Request, res: Response) => {
  try {
    const { trackOrReleaseId, type } = req.body;
    const rights = await Rights.findOne({ trackOrReleaseId, type });
    if (!rights) return res.status(404).json({ error: 'Not found' });
    res.json({ rightsType: rights.rightsType });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
};
