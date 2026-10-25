import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Character } from '../db/entities/Characters.entity';
import { OtServer } from '../db/entities/OtServer.entity';
import { User } from '../db/entities/User.entity';
import { World } from '../db/entities/World.entity';
import { CharacterService } from './characters.service';

describe('CharacterService', () => {
  let service: CharacterService;

  beforeEach(async () => {
    const repository = {};
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharacterService,
        { provide: getRepositoryToken(Character), useValue: repository },
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: getRepositoryToken(World), useValue: repository },
        { provide: getRepositoryToken(OtServer), useValue: repository },
      ],
    }).compile();

    service = module.get<CharacterService>(CharacterService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchTibiaCharacterData', () => {
    it('uses TibiaData v5 and returns the character data', async () => {
      const character = { name: 'Test Knight', world: 'Antica', vocation: 'Knight', level: 100 };
      const get = jest.spyOn(axios, 'get').mockResolvedValue({
        data: { character: { character } },
      } as never);

      await expect(service.fetchTibiaCharacterData('Test Knight')).resolves.toEqual(character);
      expect(get).toHaveBeenCalledWith(
        'https://api.tibiadata.com/v5/character/Test%20Knight',
        { timeout: 10000 },
      );
    });

    it('returns null when TibiaData reports a missing character', async () => {
      jest.spyOn(axios, 'get').mockRejectedValue({
        isAxiosError: true,
        response: { status: 404 },
      });

      await expect(service.fetchTibiaCharacterData('Missing')).resolves.toBeNull();
    });

    it('maps malformed requests to a bad request', async () => {
      jest.spyOn(axios, 'get').mockRejectedValue({
        isAxiosError: true,
        response: { status: 400 },
      });

      await expect(service.fetchTibiaCharacterData('Invalid')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('maps upstream failures to a bad gateway', async () => {
      jest.spyOn(axios, 'get').mockRejectedValue({
        isAxiosError: true,
        response: { status: 502 },
      });

      await expect(service.fetchTibiaCharacterData('Test Knight')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });
});
