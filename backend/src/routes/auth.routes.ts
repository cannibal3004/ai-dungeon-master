import { Router } from 'express';
import * as AuthController from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);
router.get('/profile', authenticate, AuthController.getProfile);

export default router;
