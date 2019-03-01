#include <stdio.h>
#include <iostream>
#include <vector>
#include <cstdlib>
#include <queue>
#include <list>

#include "DenseCRF.h"
#include "CmGMM.h"

extern "C" {

using namespace std;

typedef unsigned char uint8;

float w1 = 6;
float w2 = 10; 
float w3 = 2; 
float alpha = 20;
float beta = 33;
float gama = 10; //3 
float mu = 41;
double maxWeight = 2;

enum TrimapValue {UserBack = 0, ProbBack = 64, TrimapUnknown = 128, ProbFore = 192, UserFore = 255};

void fitGMMs(float * img3f, float * back1f, float * unary2f, int * mask1s32, CmGMM &backGMM, CmGMM &foreGMM, int width, int height)
{
	float backW = maxWeight;
	for (int y = 0; y < height; y++){
		float* segV = back1f+y*width;
		float* unryV = unary2f+y*2*width;
		int* triV = mask1s32+y*width; 
		float * img = img3f + y*width*3;
		
		for (int x = 0; x < width; x++){
			float prb; // User Back
			switch (triV[x]){
			case UserBack: 
				prb = 0; 
				break;
			case UserFore: 
				prb = 1.f; 
				break;
			default: 
				float foreP = foreGMM.P(img+x*3), backP = backGMM.P(img+x*3);
				prb = 0.8f * foreP/(foreP + backW*backP + 1e-8f);
			}
			segV[x] = prb;
			unryV[2*x] = prb;
			unryV[2*x+1] = 1-prb;

		}
	}
	return ;
}

const uint8 MaskBG = 126;
const uint8 MaskFG = 127;

int process(uint8 * img4u8, uint8 * mask1u8, int width, int height)
{
	// roi
	int RoiX0 = width-1;
	int RoiX1 = 0;
	int RoiY0 = height-1;
	int RoiY1 = 0;

	for(int j=0; j<height; j++)
		for(int i=0; i<width; i++)
			if(img4u8[i*4+3+j*width*4]==MaskBG||img4u8[i*4+3+j*width*4]==MaskFG)
			{
				if(i<RoiX0) RoiX0=i;
				if(i>RoiX1) RoiX1=i;
				if(j<RoiY0) RoiY0=j;
				if(j>RoiY1) RoiY1=j;
			}

	int RoiW = RoiX1 - RoiX0 + 1;
	int RoiH = RoiY1 - RoiY0 + 1;

	/****** Preprocess ******/
	const int size = width*height;
	const int RoiSize = RoiW*RoiH;
	// image data as float
	float * img3f = new float[RoiSize*3]; 
	uint8 * img3u8 = new uint8[RoiSize*3];
	for(int j=0; j<RoiH; j++)
		for(int i=0; i<RoiW; i++)
		{
			img3u8[i*3+j*RoiW*3] = img4u8[(i+RoiX0)*4+(j+RoiY0)*width*4];
			img3u8[i*3+1+j*RoiW*3] = img4u8[(i+RoiX0)*4+1+(j+RoiY0)*width*4];
			img3u8[i*3+2+j*RoiW*3] = img4u8[(i+RoiX0)*4+2+(j+RoiY0)*width*4];
			img3f[i*3+j*RoiW*3] = img4u8[(i+RoiX0)*4+(j+RoiY0)*width*4]/255.0;
			img3f[i*3+1+j*RoiW*3] = img4u8[(i+RoiX0)*4+1+(j+RoiY0)*width*4]/255.0;
			img3f[i*3+2+j*RoiW*3] = img4u8[(i+RoiX0)*4+2+(j+RoiY0)*width*4]/255.0;
		}
	
	int * mask1s32 = new int[RoiSize];

	// temp segment val usr labeled background 1 other 0 
	float * back1f = new float[RoiSize]; 

	for(int j=0; j<RoiH; j++)
		for(int i=0; i<RoiW; i++)
		{
			if(img4u8[(i+RoiX0)*4+3+(j+RoiY0)*width*4]==MaskBG)
			{
				back1f[i+j*RoiW] = 1.0f;
				mask1s32[i+j*RoiW] = UserBack;
			}
			else
			{
				back1f[i+j*RoiW] = 0.0f;
				mask1s32[i+j*RoiW] = TrimapUnknown;
			}
				
		}

	// temp segment val usr labeled background 0 other 1 
	float * fore1f = new float[RoiSize]; 
	for(int j=0; j<RoiH; j++)
		for(int i=0; i<RoiW; i++)
		{
			if(img4u8[(i+RoiX0)*4+3+(j+RoiY0)*width*4]==MaskFG)
			{
				fore1f[i+j*RoiW] = 1.0f;
				mask1s32[i+j*RoiW] = UserFore;
			}
			else
				fore1f[i+j*RoiW] = 0.0f;
		}
	// temp unary
	float * unary2f = new float[RoiSize*2];
	for(int i=0; i<RoiSize*2; i++)
	{
		unary2f[i] = 0.0f;
	}

	/****** GMM ******/
	CmGMM backGMM(5);
	CmGMM foreGMM(5);
	backGMM.BuildGMMs(img3f, back1f, RoiW, RoiH);
	foreGMM.BuildGMMs(img3f, fore1f, RoiW, RoiH);
	fitGMMs(img3f, fore1f, unary2f, mask1s32, backGMM, foreGMM, RoiW, RoiH);
	
	/****** CRF ******/
	DenseCRF2D crf(RoiW, RoiH, 2);
	crf.addPairwiseBilateral(alpha, alpha, beta, beta, beta, img3u8, w1);
	crf.addPairwiseGaussian(gama, gama, w2);
	crf.addPairwiseColorGaussian(mu, mu, mu, img3u8, w3);

	crf.setUnaryEnergy(unary2f);
	float* prob = crf.binarySeg(4, 1.f);
	for(int i=0; i<RoiSize; i++, prob+=2)
		fore1f[i] = prob[1]/(prob[0]+prob[1]+1e-20f);

	/****** Result ******/
	for(int j=0; j<height; j++)
		for(int i=0; i<width; i++)
		{
			if(i<RoiX0 || i>=RoiX1 || j<RoiY0 || j>RoiY1)
				mask1u8[i+j*width] = MaskBG;
			else
			{
				mask1u8[i+j*width] = fore1f[(i-RoiX0)+(j-RoiY0)*RoiW]>0.5? MaskFG:MaskBG;
				if(mask1s32[(i-RoiX0)+(j-RoiY0)*RoiW] == UserBack)
					mask1u8[i+j*width] = MaskBG;
				if(mask1s32[(i-RoiX0)+(j-RoiY0)*RoiW] == UserFore)
					mask1u8[i+j*width] = MaskFG;
			}
		}

	delete []img3f;
	delete []back1f;
	delete []fore1f;
	delete []unary2f;
	delete []img3u8;
	delete []mask1s32;
	
	
	return 0;
}
}

#if 0
// Binding code
EMSCRIPTEN_BINDINGS(my_class_example) {
  class_<MyClass>("MyClass")
  .constructor<int, std::string>()
    //.function("process", &MyClass::process, allow_raw_pointers())
    .property("x", &MyClass::getX, &MyClass::setX)
    .class_function("process", &MyClass::process, allow_raw_pointers())
    ;
}
#endif